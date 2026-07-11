import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, primaryRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, GraduationCap, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CreateClassDialog } from "@/components/CreateClassDialog";

export const Route = createFileRoute("/_authenticated/classes")({
  head: () => ({ meta: [{ title: "Classes — FacePresence" }] }),
  component: ClassesPage,
});

function ClassesPage() {
  const { user, roles } = useAuth();
  const role = primaryRole(roles);
  const canManage = role === "admin" || role === "teacher";
  const isStudent = role === "student";
  const qc = useQueryClient();

  const { data: classes } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*").order("name");
      return data ?? [];
    },
  });

  const { data: myEnrollments } = useQuery({
    queryKey: ["my-enrollments", user?.id],
    enabled: !!user && isStudent,
    queryFn: async () => {
      const { data } = await supabase
        .from("class_enrollments")
        .select("id, class_id")
        .eq("student_id", user!.id);
      return data ?? [];
    },
  });

  const enroll = useMutation({
    mutationFn: async (classId: string) => {
      const { error } = await supabase
        .from("class_enrollments")
        .insert({ class_id: classId, student_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inscription réussie");
      qc.invalidateQueries({ queryKey: ["my-enrollments", user?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const unenroll = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("class_enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Désinscription effectuée");
      qc.invalidateQueries({ queryKey: ["my-enrollments", user?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Classes</h1>
          <p className="mt-1 text-muted-foreground">
            {isStudent
              ? "Inscrivez-vous à une classe pour accéder à ses sessions."
              : "Gestion des classes et inscriptions."}
          </p>
        </div>
        {canManage && <CreateClassDialog />}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {classes?.map((c: any) => {
          if (isStudent) {
            const enrollment = myEnrollments?.find((e) => e.class_id === c.id);
            return (
              <Card key={c.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display">{c.name}</CardTitle>
                    {enrollment && <Badge>Inscrit</Badge>}
                  </div>
                  {c.level && <p className="text-sm text-muted-foreground">{c.level}</p>}
                </CardHeader>
                <CardContent className="space-y-3">
                  {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                  {enrollment ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={unenroll.isPending}
                      onClick={() => unenroll.mutate(enrollment.id)}
                    >
                      Se désinscrire
                    </Button>
                  ) : (
                    <Button
                      className="w-full gap-2"
                      disabled={enroll.isPending}
                      onClick={() => enroll.mutate(c.id)}
                    >
                      <UserPlus className="h-4 w-4" /> S'inscrire
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          }
          return <ClassCard key={c.id} classRow={c} canManage={canManage} />;
        })}
        {classes?.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="grid place-items-center gap-3 py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
                <GraduationCap className="h-6 w-6" />
              </div>
              <p className="font-medium">Aucune classe</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}


function ClassCard({ classRow, canManage }: { classRow: any; canManage: boolean }) {
  const qc = useQueryClient();
  const { data: enrollments } = useQuery({
    queryKey: ["class-enrollments", classRow.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("class_enrollments")
        .select("id, student_id, profiles!class_enrollments_student_id_fkey(full_name, email)")
        .eq("class_id", classRow.id);
      return data ?? [];
    },
  });

  const removeEnrollment = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("class_enrollments").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-enrollments", classRow.id] });
      toast.success("Élève retiré");
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display">{classRow.name}</CardTitle>
          <Badge variant="secondary">{enrollments?.length ?? 0} élèves</Badge>
        </div>
        {classRow.level && <p className="text-sm text-muted-foreground">{classRow.level}</p>}
      </CardHeader>
      <CardContent>
        {classRow.description && <p className="mb-3 text-sm text-muted-foreground">{classRow.description}</p>}
        <ul className="space-y-1.5">
          {enrollments?.slice(0, 5).map((e: any) => (
            <li key={e.id} className="flex items-center justify-between text-sm">
              <span>{e.profiles?.full_name || e.profiles?.email}</span>
              {canManage && (
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeEnrollment.mutate(e.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
          {enrollments && enrollments.length > 5 && (
            <li className="text-xs text-muted-foreground">+{enrollments.length - 5} autres</li>
          )}
          {enrollments?.length === 0 && <li className="text-xs text-muted-foreground">Aucun élève inscrit.</li>}
        </ul>
        {canManage && <EnrollDialog classId={classRow.id} />}
      </CardContent>
    </Card>
  );
}

// CreateClassDialog is imported from "@/components/CreateClassDialog"

function EnrollDialog({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");

  const { data: students } = useQuery({
    queryKey: ["students-for-enroll", classId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_enrollable_students");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: alreadyEnrolled } = useQuery({
    queryKey: ["enrolled-ids", classId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("class_enrollments")
        .select("student_id")
        .eq("class_id", classId);
      return new Set((data ?? []).map((r: any) => r.student_id));
    },
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("class_enrollments").insert({ class_id: classId, student_id: studentId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Élève inscrit");
      qc.invalidateQueries({ queryKey: ["class-enrollments", classId] });
      setOpen(false); setStudentId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="mt-3 w-full gap-2"><UserPlus className="h-3.5 w-3.5" /> Inscrire un élève</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Inscrire un élève</DialogTitle></DialogHeader>
        <Select value={studentId} onValueChange={setStudentId}>
          <SelectTrigger><SelectValue placeholder="Choisir un élève" /></SelectTrigger>
          <SelectContent>
            {students?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
          </SelectContent>
        </Select>
        <DialogFooter><Button disabled={!studentId || enroll.isPending} onClick={() => enroll.mutate()}>Inscrire</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
