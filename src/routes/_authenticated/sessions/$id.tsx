import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole } from "@/lib/auth";
import { createZoomMeetingForSession } from "@/lib/zoom.functions";
import { sessionHeartbeat, sessionLeave } from "@/lib/attendance.functions";
import { FaceVerifyDialog } from "@/components/FaceVerifyDialog";
import { StudentFaceCheckListener } from "@/components/StudentFaceCheckListener";
import { TeacherFaceCheckPanel } from "@/components/TeacherFaceCheckPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Calendar, Video, ExternalLink, ScanFace, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sessions/$id")({
  component: SessionDetail,
});

function SessionDetail() {
  const { id } = Route.useParams();
  const { user, roles } = useAuth();
  const role = primaryRole(roles);
  const qc = useQueryClient();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const heartbeat = useServerFn(sessionHeartbeat);
  const leave = useServerFn(sessionLeave);

  const { data: session, isLoading } = useQuery({
    queryKey: ["session", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, classes(name, level)")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: attendances } = useQuery({
    queryKey: ["session-attendances", id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendances")
        .select("*, profiles!attendances_student_id_fkey(full_name, email)")
        .eq("session_id", id);
      return data ?? [];
    },
  });

  const { data: enrolled } = useQuery({
    queryKey: ["session-enrolled", session?.class_id],
    enabled: !!session?.class_id && (role === "teacher" || role === "admin"),
    queryFn: async () => {
      const { data } = await supabase
        .from("class_enrollments")
        .select("student_id, profiles!class_enrollments_student_id_fkey(full_name, email)")
        .eq("class_id", session!.class_id);
      return data ?? [];
    },
  });

  const { data: myEnrollment } = useQuery({
    queryKey: ["my-enrollment", session?.class_id, user?.id],
    enabled: !!session?.class_id && !!user && role === "student",
    queryFn: async () => {
      const { data } = await supabase
        .from("class_enrollments")
        .select("id")
        .eq("class_id", session!.class_id)
        .eq("student_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const joinClass = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("class_enrollments")
        .insert({ class_id: session!.class_id, student_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vous avez rejoint la session");
      qc.invalidateQueries({ queryKey: ["my-enrollment", session?.class_id, user?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ studentId, status }: { studentId: string; status: "present" | "partial" | "absent" | "pending" }) => {
      const existing = attendances?.find((a: any) => a.student_id === studentId);
      if (existing) {
        const { error } = await supabase.from("attendances").update({
          status, verification_method: "manual", verified_by: user!.id,
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendances").insert({
          session_id: id, student_id: studentId, status,
          verification_method: "manual", verified_by: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Présence mise à jour");
      qc.invalidateQueries({ queryKey: ["session-attendances", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const studentAttendance = attendances?.find((a: any) => a.student_id === user?.id);
  const isStudentChecked = role === "student" && studentAttendance?.status === "present";

  // Heartbeat toutes les 30s + signal de départ
  useEffect(() => {
    if (!isStudentChecked) return;
    const tick = () => { heartbeat({ data: { sessionId: id } }).catch(() => {}); };
    const iv = setInterval(tick, 30_000);
    tick();
    const onUnload = () => {
      leave({ data: { sessionId: id } }).catch(() => {});
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(iv);
      window.removeEventListener("beforeunload", onUnload);
      leave({ data: { sessionId: id } }).catch(() => {});
    };
  }, [isStudentChecked, id, heartbeat, leave]);

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">Chargement…</div>;
  if (!session) return <div className="p-10">Session introuvable.</div>;

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <Link to="/sessions" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour aux sessions
      </Link>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant={session.status === "live" ? "default" : "secondary"} className="mb-2">{session.status}</Badge>
          <h1 className="font-display text-3xl font-bold">{session.title}</h1>
          <p className="mt-1 text-muted-foreground">
            {(session as any).classes?.name} · {format(new Date(session.scheduled_start), "PPp", { locale: fr })}
          </p>
          {session.description && <p className="mt-3 text-sm">{session.description}</p>}
        </div>
        <div className="flex gap-2">
          {session.zoom_join_url ? (
            <a href={session.zoom_join_url} target="_blank" rel="noreferrer">
              <Button className="gap-2"><Video className="h-4 w-4" /> Rejoindre Zoom <ExternalLink className="h-3.5 w-3.5" /></Button>
            </a>
          ) : (role === "teacher" || role === "admin") ? (
            <RegenerateZoomButton sessionId={id} />
          ) : (
            <Button variant="outline" disabled className="gap-2"><Video className="h-4 w-4" /> Lien Zoom à venir</Button>
          )}
        </div>
      </div>

      {role === "student" && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="font-display">Ma présence</CardTitle></CardHeader>
          <CardContent>
            {studentAttendance ? (
              <div className="flex items-center gap-3">
                <Badge variant={studentAttendance.status === "present" ? "default" : "secondary"}>
                  {studentAttendance.status}
                </Badge>
                {studentAttendance.confidence_score && (
                  <span className="text-sm text-muted-foreground">
                    Score : {studentAttendance.confidence_score}%
                  </span>
                )}
                <Button size="sm" variant="outline" className="ml-auto gap-2" onClick={() => setVerifyOpen(true)}>
                  <ScanFace className="h-4 w-4" /> Re-vérifier
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Validez votre présence par reconnaissance faciale.</p>
                <Button onClick={() => setVerifyOpen(true)} className="gap-2">
                  <ScanFace className="h-4 w-4" /> Vérifier ma présence
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <FaceVerifyDialog sessionId={id} open={verifyOpen} onOpenChange={setVerifyOpen} />

      {role === "student" && user && (
        <StudentFaceCheckListener sessionId={id} studentId={user.id} />
      )}

      {(role === "teacher" || role === "admin") && (
        <div className="mb-6">
          <TeacherFaceCheckPanel sessionId={id} />
        </div>
      )}

      {(role === "teacher" || role === "admin") && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Liste de présence ({enrolled?.length ?? 0} élèves)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Élève</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrolled?.map((e: any) => {
                  const att = attendances?.find((a: any) => a.student_id === e.student_id);
                  return (
                    <TableRow key={e.student_id}>
                      <TableCell className="font-medium">{e.profiles?.full_name || e.profiles?.email}</TableCell>
                      <TableCell>
                        <Badge variant={att?.status === "present" ? "default" : att?.status === "absent" ? "destructive" : "secondary"}>
                          {att?.status ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{att?.verification_method ?? "—"}</TableCell>
                      <TableCell className="text-xs">{att?.confidence_score ? `${att.confidence_score}%` : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Select
                          value={att?.status ?? ""}
                          onValueChange={(v) => updateStatus.mutate({ studentId: e.student_id, status: v as "present" | "partial" | "absent" })}
                        >
                          <SelectTrigger className="w-36"><SelectValue placeholder="Modifier" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Présent</SelectItem>
                            <SelectItem value="partial">Partiel</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {enrolled?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Aucun élève inscrit dans cette classe.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RegenerateZoomButton({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const createZoom = useServerFn(createZoomMeetingForSession);
  const [pending, setPending] = useState(false);
  return (
    <Button
      className="gap-2"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const result = await createZoom({ data: { sessionId } });
          if (result.ok) {
            toast.success("Lien Zoom généré");
            qc.invalidateQueries({ queryKey: ["session", sessionId] });
          } else {
            toast.error(result.error);
          }
        } catch (e: any) {
          toast.error(e.message);
        } finally {
          setPending(false);
        }
      }}
    >
      <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Création…" : "Générer le lien Zoom"}
    </Button>
  );
}
