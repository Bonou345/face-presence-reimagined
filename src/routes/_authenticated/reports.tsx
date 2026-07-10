import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, CheckCircle2, AlertCircle, Clock, Users } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Rapports — FacePresence" }] }),
  component: ReportsPage,
});

type ReportRow = {
  id: string;
  status: "present" | "partial" | "absent" | "pending";
  verification_method: string;
  confidence_score: number | null;
  joined_at: string | null;
  left_at: string | null;
  created_at: string;
  sessions: { id: string; title: string; class_id: string; classes?: { name?: string } | null } | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

function ReportsPage() {
  const { roles } = useAuth();
  const role = primaryRole(roles);
  const isAdmin = role === "admin" || role === "teacher";

  const [classId, setClassId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState<string>(
    format(new Date(Date.now() - 30 * 86400_000), "yyyy-MM-dd"),
  );
  const [to, setTo] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const { data: classes } = useQuery({
    queryKey: ["all-classes"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["report-attendances", classId, status, from, to],
    enabled: isAdmin,
    queryFn: async () => {
      const select =
        "id, status, verification_method, confidence_score, joined_at, left_at, created_at, " +
        "sessions!inner(id, title, class_id, scheduled_start, classes(name)), " +
        "profiles!attendances_student_id_fkey(full_name, email)";
      let q = supabase
        .from("attendances")
        .select(select)
        .gte("created_at", new Date(from).toISOString())
        .lte("created_at", new Date(new Date(to).getTime() + 86400_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      if (status !== "all") q = q.eq("status", status as "present" | "partial" | "absent" | "pending");
      const { data } = await q;
      let list = (data ?? []) as unknown as ReportRow[];
      if (classId !== "all") {
        list = list.filter((r) => r.sessions?.class_id === classId);
      }
      return list;
    },
  });

  const stats = useMemo(() => {
    const total = rows.length;
    const present = rows.filter((r) => r.status === "present").length;
    const partial = rows.filter((r) => r.status === "partial").length;
    const absent = rows.filter((r) => r.status === "absent").length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, partial, absent, rate };
  }, [rows]);

  function exportCsv() {
    const header = ["Date", "Élève", "Email", "Session", "Classe", "Statut", "Méthode", "Score"];
    const lines = rows.map((r) => {
      const s = r.sessions as unknown as { title?: string; classes?: { name?: string } } | null;
      const p = r.profiles as unknown as { full_name?: string; email?: string } | null;
      return [
        format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
        p?.full_name ?? "",
        p?.email ?? "",
        s?.title ?? "",
        s?.classes?.name ?? "",
        r.status,
        r.verification_method,
        r.confidence_score ?? "",
      ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `presences_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isAdmin) {
    return (
      <div className="p-10">
        <p className="text-sm text-muted-foreground">Accès réservé aux enseignants et administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Rapports de présence</h1>
          <p className="mt-1 text-muted-foreground">Historique filtrable, exports et tendances.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard icon={Users} label="Lignes" value={stats.total} />
        <StatCard icon={CheckCircle2} label="Présent" value={stats.present} hint={`${stats.rate}% du total`} />
        <StatCard icon={Clock} label="Partiel" value={stats.partial} />
        <StatCard icon={AlertCircle} label="Absent" value={stats.absent} />
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle className="font-display">Filtres</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Classe</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les classes</SelectItem>
                  {classes?.map((c: { id: string; name: string }) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="present">Présent</SelectItem>
                  <SelectItem value="partial">Partiel</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Du</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Au</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Historique ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Élève</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const s = r.sessions as unknown as { title?: string; classes?: { name?: string } } | null;
                  const p = r.profiles as unknown as { full_name?: string; email?: string } | null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        {format(new Date(r.created_at), "dd MMM HH:mm", { locale: fr })}
                      </TableCell>
                      <TableCell className="font-medium">{p?.full_name || p?.email || "—"}</TableCell>
                      <TableCell>{s?.title}</TableCell>
                      <TableCell className="text-muted-foreground">{s?.classes?.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "present" ? "default" :
                            r.status === "absent" ? "destructive" : "secondary"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.verification_method}</TableCell>
                      <TableCell className="text-right text-xs">
                        {r.confidence_score ? `${r.confidence_score}%` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      Aucune présence trouvée pour ces filtres.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: number; hint?: string }) {
  return (
    <Card>
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
}