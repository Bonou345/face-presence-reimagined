import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { verifyFaceAndCheckIn } from "@/lib/rekognition.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Camera, ScanFace, CheckCircle2, Loader2, Upload, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess?: () => void;
}

export function FaceVerifyDialog({ sessionId, open, onOpenChange, onSuccess }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [camError, setCamError] = useState<{ title: string; message: string; canOpenNewTab?: boolean } | null>(null);
  const [inIframe, setInIframe] = useState(false);
  const verify = useServerFn(verifyFaceAndCheckIn);
  const qc = useQueryClient();

  useEffect(() => {
    try { setInIframe(window.self !== window.top); } catch { setInIframe(true); }
  }, []);

  useEffect(() => {
    if (!open) {
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      setCaptured(null);
      setCamError(null);
      return;
    }
    void startCamera();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }
  }, [stream]);

  async function startCamera() {
    setCamError(null);
    if (!window.isSecureContext) {
      setCamError({ title: "Connexion non sécurisée", message: "La webcam exige HTTPS." });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError({ title: "Webcam indisponible", message: "Navigateur non supporté." });
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      const name = err?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCamError({
          title: "Accès caméra refusé",
          message: inIframe
            ? "L'aperçu en iframe bloque la caméra. Ouvrez dans un nouvel onglet ou importez une photo."
            : "Autorisez la caméra dans la barre d'adresse, puis réessayez.",
          canOpenNewTab: inIframe,
        });
      } else if (name === "NotFoundError") {
        setCamError({ title: "Aucune caméra", message: "Aucune webcam détectée. Importez une photo." });
      } else if (name === "NotReadableError") {
        setCamError({ title: "Caméra occupée", message: "Fermez Zoom/Teams/Meet et réessayez." });
      } else {
        setCamError({ title: "Webcam inaccessible", message: err?.message || "Erreur inconnue." });
      }
    }
  }

  function capture() {
    const v = videoRef.current;
    if (!v?.videoWidth) return toast.error("Webcam non prête");
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setCaptured(c.toDataURL("image/jpeg", 0.85));
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }

  function onFilePicked(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choisissez une image.");
    if (file.size > 5 * 1024 * 1024) return toast.error("Image trop volumineuse (max 5 Mo).");
    const reader = new FileReader();
    reader.onload = () => {
      setCaptured(String(reader.result));
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (!captured) return;
    setPending(true);
    try {
      const r = await verify({ data: { sessionId, imageDataUrl: captured } });
      if (!r.ok) {
        toast.error(r.error);
        setCaptured(null);
        return;
      }
      toast.success(`Présence confirmée (${r.similarity}% similarité)`);
      await qc.refetchQueries({ queryKey: ["session-attendances", sessionId] });
      onSuccess?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec de la vérification";
      toast.error(msg);
      setCaptured(null);
    } finally {
      setPending(false);
    }
  }

  const openInNewTab = () => window.open(window.location.href, "_blank", "noopener,noreferrer");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-primary" /> Vérification de présence
          </DialogTitle>
          <DialogDescription>
            Positionnez votre visage de face. Une photo va être comparée à votre profil enregistré.
          </DialogDescription>
        </DialogHeader>

        {camError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{camError.title}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{camError.message}</p>
              {camError.canOpenNewTab && (
                <Button size="sm" variant="outline" onClick={openInNewTab} className="gap-2">
                  <ExternalLink className="h-4 w-4" /> Nouvel onglet
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

        <div className="grid place-items-center py-3">
          {captured ? (
            <img src={captured} alt="Capture" className="aspect-square w-full rounded-lg object-cover" />
          ) : stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-square w-full rounded-lg bg-muted object-cover"
            />
          ) : (
            <div className="aspect-square grid w-full place-items-center rounded-lg bg-muted text-sm text-muted-foreground">
              Caméra indisponible
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {captured ? (
            <>
              <Button variant="outline" disabled={pending} onClick={() => setCaptured(null)}>
                Reprendre
              </Button>
              <Button disabled={pending} onClick={submit} className="gap-2">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {pending ? "Vérification…" : "Valider ma présence"}
              </Button>
            </>
          ) : (
            <>
              {stream ? (
                <Button onClick={capture} className="gap-2">
                  <Camera className="h-4 w-4" /> Capturer
                </Button>
              ) : (
                <Button onClick={startCamera} className="gap-2">
                  <Camera className="h-4 w-4" /> Réessayer la webcam
                </Button>
              )}
              <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
                <Upload className="h-4 w-4" /> Importer une photo
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
