import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole } from "@/lib/auth";
import { createZoomMeetingForSession } from "@/lib/zoom.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Video, Calendar } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { CreateClassDialog } from "@/components/CreateClassDialog";

export const Route = createFileRoute("/_authenticated/sessions/")({
  head: () => ({ meta: [{ title: "Sessions — FacePresence" }] }),
  component: SessionsPage,
});

function SessionsPage() {
  const { user, roles } = useAuth();
  const role = primaryRole(roles);
  const canCreate = role === "teacher" || role === "admin";
  const qc = useQueryClient();

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions", role, user?.id],
    queryFn: async () => {
      let query = supabase
        .from("sessions")
        .select("id, title, scheduled_start, scheduled_end, status, teacher_id, classes(name)")
        .order("scheduled_start", { ascending: false });

      if (role === "teacher" && user) {
        const { data: assignments } = await supabase
          .from("class_teachers")
          .select("class_id")
          .eq("teacher_id", user.id);
        const classIds = (assignments ?? []).map((a) => a.class_id).filter(Boolean);
        query = classIds.length > 0
          ? query.or(`teacher_id.eq.${user.id},class_id.in.(${classIds.join(",")})`)
          : query.eq("teacher_id", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime — nouvelles sessions visibles immédiatement (élèves compris).
  useEffect(() => {
    const ch = supabase
      .channel("sessions-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["sessions"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Sessions de cours</h1>
          <p className="mt-1 text-muted-foreground">Vos cours en ligne et leur statut.</p>
        </div>
        {canCreate && <CreateSessionDialog />}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : !sessions || sessions.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-3 py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
              <Video className="h-6 w-6" />
            </div>
            <p className="font-medium">Aucune session pour le moment</p>
            <p className="text-sm text-muted-foreground">
              {canCreate ? "Créez votre première session pour commencer." : "Vos enseignants n'ont pas encore créé de session."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s: any) => (
            <Link key={s.id} to="/sessions/$id" params={{ id: s.id }}>
              <Card className="h-full transition hover:shadow-elev">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge variant={s.status === "live" ? "default" : s.status === "ended" ? "secondary" : "outline"}>
                      {s.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{s.classes?.name}</span>
                  </div>
                  <CardTitle className="font-display text-lg">{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(s.scheduled_start), "PPp", { locale: fr })}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateSessionDialog() {
  const { user, roles } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [threshold, setThreshold] = useState(80);

  const { data: classes } = useQuery({
    queryKey: ["classes-for-select", role, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (role === "admin") {
        const { data } = await supabase.from("classes").select("id, name").order("name");
        return data ?? [];
      }

      const { data: assignments } = await supabase
        .from("class_teachers")
        .select("class_id")
        .eq("teacher_id", user!.id);
      const classIds = (assignments ?? []).map((a) => a.class_id).filter(Boolean);
      const filter = classIds.length > 0
        ? `created_by.eq.${user!.id},id.in.(${classIds.join(",")})`
        : `created_by.eq.${user!.id}`;
      const { data } = await supabase.from("classes").select("id, name").or(filter).order("name");
      return data ?? [];
    },
  });

  const createZoom = useServerFn(createZoomMeetingForSession);

  const create = useMutation({
    mutationFn: async () => {
      const { data: inserted, error } = await supabase
        .from("sessions")
        .insert({
          title, description, class_id: classId,
          teacher_id: user!.id,
          scheduled_start: new Date(start).toISOString(),
          scheduled_end: new Date(end).toISOString(),
          face_similarity_threshold: threshold,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Try to auto-create the Zoom meeting. If Zoom isn't configured yet,
      // the session is still created and the user is informed.
      const zoomResult = await createZoom({ data: { sessionId: inserted.id } });
      if (!zoomResult.ok) {
        toast.warning(`Session créée, mais Zoom a échoué : ${zoomResult.error}`);
      }
    },
    onSuccess: () => {
      toast.success("Session créée");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      setOpen(false);
      setTitle(""); setDescription(""); setClassId(""); setStart(""); setEnd("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Nouvelle session</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer une session</DialogTitle>
          <DialogDescription>Programmez un cours en ligne. La création Zoom sera branchée avec votre compte.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Classe</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Choisir une classe" /></SelectTrigger>
              <SelectContent>
                {classes?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                {!classes?.length && <div className="p-2 text-sm text-muted-foreground">Aucune classe — créez-en une.</div>}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label>Début</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Fin</Label><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
          </div>
          <div className="space-y-2">
            <Label>Description (optionnel)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>
              Seuil de similarité facial : <span className="font-semibold text-foreground">{threshold}%</span>
            </Label>
            <Input
              type="range" min={50} max={99} step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Plus élevé = plus strict. Recommandé : 80 % pour un bon équilibre.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !classId}>Créer la session</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
