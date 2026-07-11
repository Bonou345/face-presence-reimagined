import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ShieldOff, Link as LinkIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { primaryRole } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { adminDeleteUser } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Utilisateurs — FacePresence" }] }),
  component: UsersPage,
});

function UsersPage() {
  const { roles } = useAuth();
  if (primaryRole(roles) !== "admin") {
    return (
      <div className="p-10 text-center text-muted-foreground">Accès réservé aux administrateurs.</div>
    );
  }
  return <AdminUsersPanel />;
}

function AdminUsersPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const deleteUserFn = useServerFn(adminDeleteUser);
  const { data: users } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: roleRows } = await supabase.from("user_roles").select("*");
      return (profiles ?? []).map((p: any) => ({
        ...p,
        roles: (roleRows ?? []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role as string),
      }));
    },
  });

  const addRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-users"] }); toast.success("Rôle ajouté"); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-users"] }); toast.success("Rôle retiré"); },
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await deleteUserFn({ data: { userId } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-users"] }); toast.success("Utilisateur supprimé"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Utilisateurs & rôles</h1>
          <p className="mt-1 text-muted-foreground">Gérez les comptes, attribuez les rôles et liez les parents aux élèves.</p>
        </div>
        <ParentLinkDialog />
      </div>

      <Card>
        <CardHeader><CardTitle className="font-display">Tous les utilisateurs ({users?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôles</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r: any) => (
                        <Badge key={r} variant="secondary" className="gap-1">
                          {r}
                          <button onClick={() => removeRole.mutate({ userId: u.id, role: r })} className="ml-1 opacity-60 hover:opacity-100">
                            <ShieldOff className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {u.roles.length === 0 && <span className="text-xs text-muted-foreground">aucun</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Select onValueChange={(v) => addRole.mutate({ userId: u.id, role: v })}>
                        <SelectTrigger className="w-32"><SelectValue placeholder="+ Rôle" /></SelectTrigger>
                        <SelectContent>
                          {["admin", "teacher", "student", "parent"].filter((r: any) => !u.roles.includes(r)).map((r: any) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        disabled={u.id === user?.id}
                        onClick={() => {
                          if (confirm(`Supprimer définitivement ${u.full_name || u.email} ?`)) deleteUser.mutate(u.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ParentLinkDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState("");
  const [studentId, setStudentId] = useState("");

  const { data: parents } = useQuery({
    queryKey: ["parents-list"], enabled: open,
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "parent");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return data ?? [];
    },
  });
  const { data: students } = useQuery({
    queryKey: ["students-list"], enabled: open,
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "student");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return data ?? [];
    },
  });

  const link = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("parent_links").insert({ parent_id: parentId, student_id: studentId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lien parent-élève créé"); setOpen(false); setParentId(""); setStudentId(""); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="gap-2"><LinkIcon className="h-4 w-4" /> Lier parent ↔ élève</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Lier un parent à un élève</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Parent</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder="Choisir un parent" /></SelectTrigger>
              <SelectContent>{parents?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Élève</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Choisir un élève" /></SelectTrigger>
              <SelectContent>{students?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button disabled={!parentId || !studentId || link.isPending} onClick={() => link.mutate()}>Lier</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
