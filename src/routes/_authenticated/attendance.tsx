import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "Mes présences — FacePresence" }] }),
  component: AttendancePage,
});

function AttendancePage() {
  const { user, roles } = useAuth();
  const role = primaryRole(roles);

  const { data } = useQuery({
    queryKey: ["my-attendance", user?.id, role],
    queryFn: async () => {
      let studentIds: string[] = [];
      if (role === "parent") {
        const { data: links } = await supabase.from("parent_links").select("student_id").eq("parent_id", user!.id);
        studentIds = (links ?? []).map((l: any) => l.student_id);
        if (studentIds.length === 0) return [];
      } else {
        studentIds = [user!.id];
      }
      const { data } = await supabase
        .from("attendances")
        .select("*, sessions(title, scheduled_start, classes(name)), profiles!attendances_student_id_fkey(full_name)")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">
          {role === "parent" ? "Présences de mes enfants" : "Mes présences"}
        </h1>
        <p className="mt-1 text-muted-foreground">Historique complet des sessions et de leur statut.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="font-display">Historique ({data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {role === "parent" && <TableHead>Élève</TableHead>}
                <TableHead>Session</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Méthode</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((a: any) => (
                <TableRow key={a.id}>
                  {role === "parent" && <TableCell className="font-medium">{a.profiles?.full_name}</TableCell>}
                  <TableCell className="font-medium">{a.sessions?.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.sessions?.classes?.name}</TableCell>
                  <TableCell className="text-sm">{a.sessions?.scheduled_start ? format(new Date(a.sessions.scheduled_start), "Pp", { locale: fr }) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === "present" ? "default" : a.status === "absent" ? "destructive" : "secondary"}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.verification_method}</TableCell>
                </TableRow>
              ))}
              {data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={role === "parent" ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">
                    Aucune présence enregistrée pour le moment.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
