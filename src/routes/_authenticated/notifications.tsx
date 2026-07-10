import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — FacePresence" }] }),
  component: NotificationsPage,
});

const kindIcon: Record<string, typeof Bell> = {
  attendance_present: CheckCircle2,
  attendance_partial: Clock,
  attendance_absent: AlertCircle,
  session_starting: Bell,
  manual_correction: CheckCheck,
};

type Notif = {
  id: string;
  kind: string;
  title: string;
  message: string;
  created_at: string;
  read_at: string | null;
};

// supabase types not yet generated for "notifications" — cast accessor
const sb = supabase as unknown as {
  from: (t: string) => {
    select: (s: string) => {
      eq: (c: string, v: string) => {
        order: (c: string, o: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: Notif[] | null }>;
        };
      };
    };
    update: (v: Record<string, unknown>) => {
      eq: (c: string, v: string) => Promise<{ data: unknown }> & {
        is: (c: string, v: null) => Promise<{ data: unknown }>;
      };
    };
  };
};

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: items = [] } = useQuery<Notif[]>({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data } = await sb
        .from("notifications")
        .select("*")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await sb
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await sb
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", user!.id)
        .is("read_at", null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Notifications</h1>
          <p className="mt-1 text-muted-foreground">
            {unread > 0 ? `${unread} non lue${unread > 1 ? "s" : ""}` : "Tout est à jour"}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} className="gap-2">
            <CheckCheck className="h-4 w-4" /> Tout marquer lu
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Historique</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {items.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">Aucune notification pour le moment.</p>
          )}
          {items.map((n) => {
            const Icon = kindIcon[n.kind] ?? Bell;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-6 py-4 ${n.read_at ? "opacity-60" : "bg-primary/[0.02]"}`}
              >
                <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{n.title}</p>
                    {!n.read_at && <Badge variant="default" className="h-5 px-1.5 text-[10px]">Nouveau</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(n.created_at), "PPp", { locale: fr })}
                  </p>
                </div>
                {!n.read_at && (
                  <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>
                    Marquer lu
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}