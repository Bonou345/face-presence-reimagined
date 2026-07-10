import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { submitFaceCheckResult } from "@/lib/face-check.functions";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Camera, ScanFace, Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  studentId: string;
}

type ActiveRound = { id: string; started_at: string; label: string | null };

/**
 * Écoute en temps réel les vérifications faciales lancées par l'enseignant
 * pour cette session, et affiche une popup à l'élève pour capturer + envoyer.
 */
export function StudentFaceCheckListener({ sessionId, studentId }: Props) {
  const [round, setRound] = useState<ActiveRound | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ present: boolean; similarity: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const submit = useServerFn(submitFaceCheckResult);
  const qc = useQueryClient();

  // Détection round actif au montage + realtime
  useEffect(() => {
    let cancelled = false;
    async function loadActive() {
      const { data } = await supabase
        .from("face_check_rounds")
        .select("id, started_at, label")
        .eq("session_id", sessionId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const r = data?.[0] as ActiveRound | undefined;
      if (!r) return;
      // vérifier si l'élève a déjà répondu
      const { data: existing } = await supabase
        .from("face_check_results")
        .select("id").eq("round_id", r.id).eq("student_id", studentId).maybeSingle();
      if (!existing) setRound(r);
    }
    loadActive();

    const ch = supabase
      .channel(`fcr-${sessionId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "face_check_rounds", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const r = payload.new as ActiveRound & { ended_at: string | null };
          if (!r.ended_at) {
            setDone(null);
            setError(null);
            setRound({ id: r.id, started_at: r.started_at, label: r.label });
          }
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "face_check_rounds", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const r = payload.new as { id: string; ended_at: string | null };
          if (r.ended_at) setRound((cur) => (cur?.id === r.id ? null : cur));
        })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [sessionId, studentId]);

  // Démarre la caméra dès qu'un round s'ouvre
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
      qc.invalidateQueries({ queryKey: ["session-attendances", sessionId] });
      if (r.present) toast.success(`Présence confirmée (${r.similarity}%)`);
      else toast.error(r.error || `Visage non reconnu (${r.similarity}%)`);
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

  const open = !!round;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-primary" />
            Vérification de présence en cours
          </DialogTitle>
          <DialogDescription>
            L'enseignant vient de lancer un contrôle. Regardez la caméra pour valider votre présence.
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
            <Button onClick={close}>Fermer</Button>
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
