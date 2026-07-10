import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, UserCircle2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/parent")({
  head: () => ({ meta: [{ title: "Suivi de mes enfants — FacePresence" }] }),
  component: ParentPage,
});

type Child = {
  id: string;
  full_name: string | null;
  email: string | null;
  student_number: string | null;
  classes: { class_id: string; classes: { id: string; name: string; level: string | null } | null }[];
};

function ParentPage() {
  const { user } = useAuth();
  const [nameQ, setNameQ] = useState("");
  const [classQ, setClassQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Enfants liés au parent
  const { data: children } = useQuery({
    queryKey: ["parent-children", user?.id],
    queryFn: async () => {
      const { data: links } = await supabase
        .from("parent_links")
        .select("student_id")
        .eq("parent_id", user!.id);
      const ids = (links ?? []).map((l) => l.student_id);
      if (ids.length === 0) return [] as Child[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email, student_number")
        .in("id", ids);
      const { data: enr } = await supabase
        .from("class_enrollments")
        .select("student_id, class_id, classes(id, name, level)")
        .in("student_id", ids);
      return (profs ?? []).map((p) => ({
        ...p,
        classes: (enr ?? [])
          .filter((e) => e.student_id === p.id)
          .map((e) => ({ class_id: e.class_id, classes: (e as any).classes })),
      })) as Child[];
    },
  });

  const filtered = useMemo(() => {
    const n = nameQ.trim().toLowerCase();
    const c = classQ.trim().toLowerCase();
    return (children ?? []).filter((k) => {
      const nameOk = !n
        || (k.full_name ?? "").toLowerCase().includes(n)
        || (k.email ?? "").toLowerCase().includes(n)
        || (k.student_number ?? "").toLowerCase().includes(n);
      const classOk = !c || k.classes.some((cc) => (cc.classes?.name ?? "").toLowerCase().includes(c));
      return nameOk && classOk;
    });
  }, [children, nameQ, classQ]);

  const { data: history } = useQuery({
    queryKey: ["parent-history", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendances")
        .select("id, status, verification_method, confidence_score, created_at, joined_at, left_at, total_seconds_present, sessions(title, scheduled_start, scheduled_end, classes(name))")
        .eq("student_id", selected!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Suivi de mes enfants</h1>
        <p className="mt-1 text-muted-foreground">
          Retrouvez votre enfant par son nom ou sa classe et consultez son historique de présence.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" /> Rechercher un enfant
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nom, e-mail ou matricule</Label>
            <Input value={nameQ} onChange={(e) => setNameQ(e.target.value)} placeholder="Ex : Sarah" />
          </div>
          <div className="space-y-2">
            <Label>Classe</Label>
            <Input value={classQ} onChange={(e) => setClassQ(e.target.value)} placeholder="Ex : 3e A" />
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {(children?.length ?? 0) === 0
              ? "Aucun enfant n'est encore rattaché à votre compte. Contactez l'administration."
              : "Aucun enfant ne correspond à la recherche."}
          </p>
        )}
        {filtered.map((k) => {
          const active = selected === k.id;
          return (
            <button
              key={k.id}
              onClick={() => setSelected(k.id)}
              className={`rounded-lg border p-4 text-left transition ${
                active ? "border-primary bg-primary/5" : "hover:bg-accent"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
                  <UserCircle2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{k.full_name || k.email || "Élève"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {k.classes.map((c) => c.classes?.name).filter(Boolean).join(", ") || "Aucune classe"}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">
              Historique de présence ({history?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Temps présent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history?.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.sessions?.title ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.sessions?.classes?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.sessions?.scheduled_start
                        ? format(new Date(a.sessions.scheduled_start), "Pp", { locale: fr })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          a.status === "present"
                            ? "default"
                            : a.status === "absent"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.verification_method ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.confidence_score ? `${a.confidence_score}%` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.total_seconds_present
                        ? `${Math.round(a.total_seconds_present / 60)} min`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {(history?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      Aucune présence enregistrée pour cet enfant.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
