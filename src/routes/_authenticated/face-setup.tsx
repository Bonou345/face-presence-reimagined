import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { indexStudentFace } from "@/lib/rekognition.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Camera, ScanFace, CheckCircle2, Loader2, Upload, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/face-setup")({
  head: () => ({ meta: [{ title: "Profil facial — FacePresence" }] }),
  component: FaceSetupPage,
});

function FaceSetupPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const indexFace = useServerFn(indexStudentFace);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [camError, setCamError] = useState<{ title: string; message: string; canOpenNewTab?: boolean } | null>(null);
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    try { setInIframe(window.self !== window.top); } catch { setInIframe(true); }
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["face-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("face_profiles").select("*").eq("student_id", user!.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  // Callback ref: fires the instant <video> mounts, so we can attach the stream
  // synchronously without relying on a separate effect + ref timing.
  const attachVideo = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  };

  async function startCamera() {
    setCamError(null);
    if (!window.isSecureContext) {
      setCamError({
        title: "Connexion non sécurisée",
        message: "La webcam exige HTTPS. Ouvrez le site en https://… puis réessayez.",
      });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError({
        title: "Webcam indisponible",
        message: "Votre navigateur ne supporte pas l'accès à la caméra. Utilisez Chrome, Edge, Firefox ou Safari récent.",
      });
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
      });
      // If the <video> is already mounted, attach synchronously (preserves the
      // user-gesture context for play()). Otherwise the callback ref handles it.
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        const p = videoRef.current.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
      setStream(s);
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      const name = err?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCamError({
          title: "Accès à la caméra refusé",
          message: inIframe
            ? "L'aperçu Lovable est affiché dans une iframe qui bloque la caméra. Ouvrez l'application dans un nouvel onglet (bouton ci-dessous), puis autorisez la caméra."
            : "Cliquez sur l'icône 🎥 / 🔒 à gauche de la barre d'adresse → Autoriser la caméra → rechargez la page.",
          canOpenNewTab: inIframe,
        });
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setCamError({ title: "Aucune caméra détectée", message: "Branchez une webcam ou utilisez « Importer une photo »." });
      } else if (name === "NotReadableError") {
        setCamError({ title: "Caméra occupée", message: "Une autre application (Zoom, Teams, Meet…) utilise la caméra. Fermez-la puis réessayez." });
      } else {
        setCamError({ title: "Webcam inaccessible", message: err?.message || "Erreur inconnue. Essayez « Importer une photo »." });
      }
    }
  }

  function capture() {
    const v = videoRef.current;
    if (!v) return;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) {
      toast.error("La webcam n'est pas encore prête, réessayez dans une seconde.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(v, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (!dataUrl || dataUrl.length < 100) {
      toast.error("Capture échouée, réessayez.");
      return;
    }
    setCapturedImage(dataUrl);
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }

  function onFilePicked(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez choisir un fichier image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop volumineuse (max 5 Mo).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCapturedImage(String(reader.result));
    reader.onerror = () => toast.error("Lecture du fichier impossible.");
    reader.readAsDataURL(file);
  }

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!capturedImage || !capturedImage.startsWith("data:image")) throw new Error("Capture invalide, recommencez.");
      setEnrolling(true);
      await indexFace({ data: { imageDataUrl: capturedImage } });
    },
    onSuccess: () => {
      toast.success("Profil facial indexé sur AWS Rekognition");
      qc.invalidateQueries({ queryKey: ["face-profile", user?.id] });
      setCapturedImage(null);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setEnrolling(false),
  });

  const deleteProfile = useMutation({
    mutationFn: async () => {
      await removeFace({});
    },
    onSuccess: () => {
      toast.success("Photo supprimée");
      qc.invalidateQueries({ queryKey: ["face-profile", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openInNewTab = () => window.open(window.location.href, "_blank", "noopener,noreferrer");

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Mon profil facial</h1>
        <p className="mt-1 text-muted-foreground">
          Enregistrez une photo de référence pour permettre la vérification automatique de votre présence aux cours.
        </p>
      </div>

      {profile?.image_url && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-display">Profil actuel</CardTitle>
              <Badge variant={profile.rekognition_face_id ? "default" : "secondary"}>
                {profile.rekognition_face_id ? "Indexé AWS" : "En attente d'indexation"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <img src={profile.image_url} alt="Profil facial" className="h-48 w-48 rounded-lg object-cover" />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2" disabled={deleteProfile.isPending}>
                  {deleteProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Supprimer la photo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer votre photo de référence ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Votre profil facial sera retiré d'AWS Rekognition et du stockage. La vérification automatique de présence ne fonctionnera plus tant que vous n'enregistrerez pas une nouvelle photo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteProfile.mutate()}>Supprimer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-primary" />
            {profile ? "Mettre à jour ma photo" : "Enregistrer ma photo"}
          </CardTitle>
          <CardDescription>Positionnez votre visage de face, dans un environnement bien éclairé.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inIframe && !capturedImage && !stream && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Aperçu en iframe</AlertTitle>
              <AlertDescription>
                Si la webcam est bloquée, ouvrez l'app dans un nouvel onglet ou utilisez « Importer une photo ».
              </AlertDescription>
            </Alert>
          )}

          {camError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{camError.title}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{camError.message}</p>
                {camError.canOpenNewTab && (
                  <Button size="sm" variant="outline" onClick={openInNewTab} className="gap-2">
                    <ExternalLink className="h-4 w-4" /> Ouvrir dans un nouvel onglet
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => onFilePicked(e.target.files?.[0])}
          />

          <div className="grid place-items-center">
            {capturedImage ? (
              <>
                <img src={capturedImage} alt="Capture" className="aspect-square w-full max-w-sm rounded-xl object-cover" />
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => { setCapturedImage(null); }}>Reprendre</Button>
                  <Button onClick={() => saveProfile.mutate()} disabled={enrolling}>
                    {enrolling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Valider et enregistrer
                  </Button>
                </div>
              </>
            ) : stream ? (
              <>
                <video ref={attachVideo} autoPlay playsInline muted className="aspect-square w-full max-w-sm rounded-xl bg-muted object-cover" />
                <Button onClick={capture} className="mt-4 gap-2"><Camera className="h-4 w-4" /> Capturer</Button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-primary">
                  <Camera className="h-7 w-7" />
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={startCamera} className="gap-2">
                    <Camera className="h-4 w-4" /> Activer la webcam
                  </Button>
                  <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
                    <Upload className="h-4 w-4" /> Importer une photo
                  </Button>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Sur mobile, « Importer une photo » ouvre directement l'appareil photo.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
