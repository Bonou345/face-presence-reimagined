import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole } from "@/lib/auth";
import { submitFaceCheckResult } from "@/lib/face-check.functions";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Camera, ScanFace, Loader2, AlertTriangle, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type ActiveRound = {
  id: string;
  session_id: string;
  started_at: string;
  label: string | null;
  sessionTitle?: string | null;
  className?: string | null;
};

/**
 * Écoute GLOBALE : où que soit l'élève dans l'app (ou revenu depuis Zoom),
 * dès qu'un enseignant lance une vérification faciale pour une session à
 * laquelle il a accès, une popup s'affiche pour capturer et envoyer.
 */
export function GlobalFaceCheckListener() {
  const { user, roles } = useAuth();
  const role = primaryRole(roles);
  const enabled = !!user && role === "student";

  const [round, setRound] = useState<ActiveRound | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ present: boolean; similarity: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const submit = useServerFn(submitFaceCheckResult);
  const qc = useQueryClient();

  // Hydrate context (session title + class) so the popup dit clairement quel cours
  async function hydrate(r: {
    id: string; session_id: string; started_at: string; label: string | null;
  }): Promise<ActiveRound> {
    const { data: s } = await supabase
      .from("sessions")
      .select("title, classes(name)")
      .eq("id", r.session_id)
      .maybeSingle();
    return {
      ...r,
      sessionTitle: s?.title ?? null,
      className: (s?.classes as { name?: string } | null)?.name ?? null,
    };
  }

  // Round actif au montage (au cas où lancé avant l'arrivée) + realtime global
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("face_check_rounds")
        .select("id, session_id, started_at, label")
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1);
      if (cancelled || !data?.length) return;
      const r = data[0] as ActiveRound;
      const { data: existing } = await supabase
        .from("face_check_results")
        .select("id").eq("round_id", r.id).eq("student_id", user!.id).maybeSingle();
      if (!existing) setRound(await hydrate(r));
    })();

    const ch = supabase
      .channel("global-face-check-rounds")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "face_check_rounds" },
        async (payload) => {
          const r = payload.new as ActiveRound & { ended_at: string | null };
          if (r.ended_at) return;
          setDone(null);
          setError(null);
          setRound(await hydrate(r));
          try {
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification("Vérification de présence", {
                body: "L'enseignant vient de lancer un contrôle facial. Retournez sur l'app.",
              });
            }
          } catch {/* noop */}
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "face_check_rounds" },
        (payload) => {
          const r = payload.new as { id: string; ended_at: string | null };
          if (r.ended_at) setRound((cur) => (cur?.id === r.id ? null : cur));
        })
      .subscribe();

    // Demande discrète de permission notifications pour prévenir l'élève quand il est dans Zoom
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [enabled, user?.id]);

  // Caméra
  useEffect(() => {
    if (!round) {
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      return;
    }
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        });
        setStream(s);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message || "Accès caméra refusé");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      v.play().catch(() => {});
    }
  }, [stream]);

  async function capture() {
    if (!round) return;
    const v = videoRef.current;
    if (!v?.videoWidth) return toast.error("Webcam non prête");
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    setPending(true);
    try {
      const r = await submit({ data: { roundId: round.id, imageDataUrl: dataUrl } });
      setDone({ present: r.present, similarity: r.similarity });
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      if (r.present) {
        await qc.refetchQueries({ queryKey: ["session-attendances", round.session_id] });
        toast.success(`Présence confirmée (${r.similarity}%)`);
      } else {
        qc.invalidateQueries({ queryKey: ["session-attendances", round.session_id] });
        toast.error(r.error || `Visage non reconnu (${r.similarity}%)`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Échec";
      setError(msg);
      toast.error(msg);
    } finally {
      setPending(false);
    }
  }

  function close() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setRound(null);
    setDone(null);
    setError(null);
  }

  if (!enabled) return null;
  const open = !!round;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-primary" />
            Vérification de présence
          </DialogTitle>
          <DialogDescription>
            {round?.sessionTitle
              ? <>Cours <b>{round.sessionTitle}</b>{round.className ? ` — ${round.className}` : ""}. Regardez la caméra pour valider votre présence.</>
              : "L'enseignant vient de lancer un contrôle. Regardez la caméra pour valider votre présence."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid place-items-center py-3">
          {done ? (
            <div className={`aspect-square grid w-full place-items-center rounded-lg ${done.present ? "bg-green-500/10" : "bg-destructive/10"}`}>
              {done.present ? (
                <div className="flex flex-col items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-10 w-10" />
                  <p className="font-semibold">Présence enregistrée</p>
                  <p className="text-xs opacity-70">Similarité {done.similarity}%</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <XCircle className="h-10 w-10" />
                  <p className="font-semibold">Non reconnu</p>
                  <p className="text-xs opacity-70">Similarité {done.similarity}%</p>
                </div>
              )}
            </div>
          ) : stream ? (
            <video ref={videoRef} autoPlay playsInline muted
              className="aspect-square w-full rounded-lg bg-muted object-cover" />
          ) : (
            <div className="aspect-square grid w-full place-items-center rounded-lg bg-muted text-sm text-muted-foreground">
              Initialisation de la caméra…
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {done ? (
            <>
              {round && (
                <Button asChild variant="outline">
                  <Link to="/sessions/$id" params={{ id: round.session_id }} onClick={close} className="gap-2">
                    <ExternalLink className="h-4 w-4" /> Ouvrir la session
                  </Link>
                </Button>
              )}
              <Button onClick={close}>Fermer</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={pending}>Ignorer</Button>
              <Button disabled={pending || !stream} onClick={capture} className="gap-2">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {pending ? "Envoi…" : "Capturer et valider"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
