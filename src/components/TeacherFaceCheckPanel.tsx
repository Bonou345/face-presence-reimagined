import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startFaceCheckRound, endFaceCheckRound } from "@/lib/face-check.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScanFace, Loader2, CheckCircle2, XCircle, PlayCircle, StopCircle, SlidersHorizontal } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  sessionId: string;
}

type Round = {
  id: string; session_id: string; started_at: string; ended_at: string | null; label: string | null;
};
type Result = {
  id: string; round_id: string; student_id: string; present: boolean;
  similarity: number | null; error: string | null; created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
};

export function TeacherFaceCheckPanel({ sessionId }: Props) {
  const qc = useQueryClient();
  const start = useServerFn(startFaceCheckRound);
  const end = useServerFn(endFaceCheckRound);
  const [pending, setPending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rounds } = useQuery({
    queryKey: ["face-check-rounds", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("face_check_rounds")
        .select("id, session_id, started_at, ended_at, label")
        .eq("session_id", sessionId)
        .order("started_at", { ascending: false });
      return (data ?? []) as Round[];
    },
  });

  const activeRound = rounds?.find((r) => !r.ended_at);

  const { data: results } = useQuery({
    queryKey: ["face-check-results", sessionId, expanded ?? activeRound?.id],
    enabled: !!(expanded || activeRound),
    queryFn: async () => {
      const id = expanded ?? activeRound!.id;
      const { data } = await supabase
        .from("face_check_results")
        .select("*")
        .eq("round_id", id)
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as Omit<Result, "profiles">[];
      const ids = Array.from(new Set(rows.map((r) => r.student_id)));
      if (ids.length === 0) return [] as Result[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
      return rows.map((r) => ({ ...r, profiles: map.get(r.student_id) ?? null })) as Result[];
    },
  });

  // Realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel(`fcr-teacher-${sessionId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "face_check_rounds", filter: `session_id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["face-check-rounds", sessionId] }))
      .on("postgres_changes",
        { event: "*", schema: "public", table: "face_check_results" },
        () => qc.invalidateQueries({ queryKey: ["face-check-results", sessionId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, qc]);

  async function onStart() {
    setPending(true);
    try {
      const result = await start({ data: { sessionId, label: new Date().toLocaleTimeString("fr-FR") } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Vérification lancée. Les élèves connectés reçoivent la demande.");
      qc.invalidateQueries({ queryKey: ["face-check-rounds", sessionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setPending(false); }
  }

  async function onEnd(roundId: string) {
    setPending(true);
    try {
      const result = await end({ data: { roundId } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      qc.invalidateQueries({ queryKey: ["face-check-rounds", sessionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally { setPending(false); }
  }

  const shownRoundId = expanded ?? activeRound?.id ?? null;
  const presentCount = results?.filter((r) => r.present).length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="font-display flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-primary" /> Vérifications faciales
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Lancez un contrôle à tout moment ; les élèves connectés valident leur présence.
          </p>
        </div>
        {activeRound ? (
          <Button variant="destructive" disabled={pending} onClick={() => onEnd(activeRound.id)} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
            Terminer le contrôle
          </Button>
        ) : (
          <Button disabled={pending} onClick={onStart} className="gap-2">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Lancer une vérification
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <ThresholdEditor sessionId={sessionId} />
        {(rounds?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">Aucun contrôle lancé pour cette session.</p>
        )}

        {rounds && rounds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {rounds.map((r) => {
              const active = !r.ended_at;
              const selected = shownRoundId === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setExpanded(r.id)}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    selected ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                  }`}
                >
                  <span className="font-medium">{format(new Date(r.started_at), "HH:mm:ss", { locale: fr })}</span>
                  {active && <Badge variant="default" className="ml-2">en cours</Badge>}
                </button>
              );
            })}
          </div>
        )}

        {shownRoundId && (
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b px-4 py-2 text-sm">
              <span className="font-medium">
                Réponses ({results?.length ?? 0}) — présents : {presentCount}
              </span>
              {activeRound?.id === shownRoundId && (
                <Badge variant="default">Contrôle en cours</Badge>
              )}
            </div>
            <div className="divide-y">
              {(results?.length ?? 0) === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  En attente des captures des élèves…
                </p>
              )}
              {results?.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {r.present ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-medium">
                      {r.profiles?.full_name || r.profiles?.email || r.student_id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {r.similarity != null && <span>{Number(r.similarity).toFixed(0)}%</span>}
                    {r.error && <span className="text-destructive">{r.error}</span>}
                    <span>{format(new Date(r.created_at), "HH:mm:ss", { locale: fr })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ThresholdEditor({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["session-threshold", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("face_similarity_threshold")
        .eq("id", sessionId).maybeSingle();
      return (data as { face_similarity_threshold?: number } | null)?.face_similarity_threshold ?? 80;
    },
  });
  const [value, setValue] = useState<number>(80);
  useEffect(() => { if (typeof data === "number") setValue(data); }, [data]);

  const save = useMutation({
    mutationFn: async (v: number) => {
      const { error } = await supabase
        .from("sessions")
        .update({ face_similarity_threshold: v })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Seuil mis à jour");
      qc.invalidateQueries({ queryKey: ["session-threshold", sessionId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const dirty = data !== undefined && value !== data;

  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-sm">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          Seuil de similarité : <span className="font-semibold text-foreground">{value}%</span>
        </Label>
        <Button
          size="sm"
          variant={dirty ? "default" : "outline"}
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(value)}
        >
          Appliquer
        </Button>
      </div>
      <Input
        type="range" min={50} max={99} step={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        Utilisé pour toutes les prochaines vérifications faciales de cette session.
      </p>
    </div>
  );
}
