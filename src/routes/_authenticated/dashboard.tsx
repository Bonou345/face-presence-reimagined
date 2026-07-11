import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle2, AlertCircle, Users, GraduationCap, Video, ArrowRight, ScanFace } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — FacePresence" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, roles } = useAuth();
  const role = primaryRole(roles);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Bonjour 👋
        </h1>
        <p className="mt-1 text-muted-foreground">
          {role === "admin" && "Pilotez l'ensemble de la plateforme depuis votre espace administrateur."}
          {role === "teacher" && "Préparez vos sessions et suivez la présence de vos élèves."}
          {role === "student" && "Rejoignez vos cours et consultez votre historique de présence."}
          {role === "parent" && "Suivez la présence de votre enfant en toute transparence."}
        </p>
      </div>

      {role === "admin" && <AdminStats />}
      {role === "teacher" && <TeacherStats userId={user!.id} />}
      {role === "student" && <StudentStats userId={user!.id} />}
      {role === "parent" && <ParentStats userId={user!.id} />}

      <UpcomingSessions />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, to }: { icon: typeof Calendar; label: string; value: string | number; hint?: string; to?: string }) {
  const inner = (
    <Card className={to ? "transition hover:shadow-elev cursor-pointer" : undefined}>
      <CardContent className="flex items-start gap-4 p-6">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-display text-2xl font-bold">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
  if (to) return <Link to={to as any}>{inner}</Link>;
  return inner;
}

function AdminStats() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, classes, sessions, presences] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("classes").select("id", { count: "exact", head: true }),
        supabase.from("sessions").select("id", { count: "exact", head: true }),
        supabase.from("attendances").select("id", { count: "exact", head: true }).eq("status", "present"),
      ]);
      return {
        users: users.count ?? 0,
        classes: classes.count ?? 0,
        sessions: sessions.count ?? 0,
        presences: presences.count ?? 0,
      };
    },
  });
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard icon={Users} label="Utilisateurs" value={data?.users ?? "—"} to="/users" />
      <StatCard icon={GraduationCap} label="Classes" value={data?.classes ?? "—"} to="/classes" />
      <StatCard icon={Video} label="Sessions" value={data?.sessions ?? "—"} to="/sessions" />
      <StatCard icon={CheckCircle2} label="Présences validées" value={data?.presences ?? "—"} />
    </div>
  );
}

function TeacherStats({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["teacher-stats", userId],
    queryFn: async () => {
      const [sessions, upcoming] = await Promise.all([
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("teacher_id", userId),
        supabase.from("sessions").select("id", { count: "exact", head: true }).eq("teacher_id", userId).gte("scheduled_start", new Date().toISOString()),
      ]);
      return { total: sessions.count ?? 0, upcoming: upcoming.count ?? 0 };
    },
  });
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard icon={Video} label="Sessions totales" value={data?.total ?? "—"} />
      <StatCard icon={Calendar} label="À venir" value={data?.upcoming ?? "—"} />
      <Card>
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <p className="text-sm text-muted-foreground">Démarrer rapidement</p>
            <p className="font-display text-lg font-semibold">Nouvelle session</p>
          </div>
          <Link to="/sessions"><Button size="sm">Créer <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}

function StudentStats({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["student-stats", userId],
    queryFn: async () => {
      const [att, face] = await Promise.all([
        supabase.from("attendances").select("status").eq("student_id", userId),
        supabase.from("face_profiles").select("id, rekognition_face_id").eq("student_id", userId).maybeSingle(),
      ]);
      const rows = att.data ?? [];
      return {
        present: rows.filter((r: any) => r.status === "present").length,
        partial: rows.filter((r: any) => r.status === "partial").length,
        absent: rows.filter((r: any) => r.status === "absent").length,
        faceReady: !!face.data?.rekognition_face_id,
        faceConfigured: !!face.data,
      };
    },
  });
  return (
    <>
      {data && !data.faceReady && (
        <Card className="mb-6 border-warning/40 bg-warning/5">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-warning/15 text-warning-foreground">
                <ScanFace className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Configurez votre profil facial</p>
                <p className="text-sm text-muted-foreground">Nécessaire pour valider automatiquement votre présence.</p>
              </div>
            </div>
            <Link to="/face-setup"><Button size="sm">Configurer</Button></Link>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={CheckCircle2} label="Présences" value={data?.present ?? "—"} />
        <StatCard icon={AlertCircle} label="Partielles" value={data?.partial ?? "—"} />
        <StatCard icon={AlertCircle} label="Absences" value={data?.absent ?? "—"} />
      </div>
    </>
  );
}

function ParentStats({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["parent-stats", userId],
    queryFn: async () => {
      const links = await supabase.from("parent_links").select("student_id").eq("parent_id", userId);
      const studentIds = (links.data ?? []).map((l: any) => l.student_id);
      if (studentIds.length === 0) return { children: 0, present: 0, absent: 0 };
      const att = await supabase.from("attendances").select("status").in("student_id", studentIds);
      const rows = att.data ?? [];
      return {
        children: studentIds.length,
        present: rows.filter((r: any) => r.status === "present").length,
        absent: rows.filter((r: any) => r.status === "absent").length,
      };
    },
  });
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard icon={Users} label="Enfants suivis" value={data?.children ?? "—"} />
      <StatCard icon={CheckCircle2} label="Présences" value={data?.present ?? "—"} />
      <StatCard icon={AlertCircle} label="Absences" value={data?.absent ?? "—"} />
    </div>
  );
}

function UpcomingSessions() {
  const { data } = useQuery({
    queryKey: ["upcoming-sessions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sessions")
        .select("id, title, scheduled_start, status, classes(name)")
        .gte("scheduled_start", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order("scheduled_start", { ascending: true })
        .limit(5);
      return data ?? [];
    },
  });

  return (
    <Card className="mt-8">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display">Sessions à venir</CardTitle>
        <Link to="/sessions"><Button variant="ghost" size="sm">Voir tout <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucune session prévue.</p>
        ) : (
          <ul className="divide-y">
            {data.map((s: any) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.classes?.name} · {format(new Date(s.scheduled_start), "PPP 'à' HH:mm", { locale: fr })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.status === "live" ? "default" : "secondary"}>{s.status}</Badge>
                  <Link to="/sessions/$id" params={{ id: s.id }}><Button size="sm" variant="outline">Ouvrir</Button></Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
