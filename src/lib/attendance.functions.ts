import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Heartbeat appelé toutes les ~30s par l'élève pendant la session.
 * Met à jour last_seen_at et incrémente le temps de présence.
 */
export const sessionHeartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: attRaw } = await supabase
      .from("attendances")
      .select("id, last_seen_at, total_seconds_present, status" as never)
      .eq("session_id", data.sessionId)
      .eq("student_id", userId)
      .maybeSingle();
    const att = attRaw as { id: string; last_seen_at: string | null; total_seconds_present: number | null } | null;
    if (!att) return { ok: false };

    const now = new Date();
    const last = att.last_seen_at ? new Date(att.last_seen_at) : null;
    const deltaSec = last ? Math.min(60, Math.max(0, Math.round((now.getTime() - last.getTime()) / 1000))) : 0;

    await supabase
      .from("attendances")
      .update({
        last_seen_at: now.toISOString(),
        total_seconds_present: (att.total_seconds_present ?? 0) + deltaSec,
      } as never)
      .eq("id", att.id);
    return { ok: true };
  });

/**
 * Appelé quand l'élève quitte (onBeforeUnload, bouton "quitter").
 * Calcule le statut final en fonction du temps passé / durée prévue.
 */
export const sessionLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: session } = await supabase
      .from("sessions")
      .select("scheduled_start, scheduled_end")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) return { ok: false };

    const { data: attRaw } = await supabase
      .from("attendances")
      .select("id, total_seconds_present" as never)
      .eq("session_id", data.sessionId)
      .eq("student_id", userId)
      .maybeSingle();
    const att = attRaw as { id: string; total_seconds_present: number | null } | null;
    if (!att) return { ok: false };

    const planned = Math.max(
      60,
      Math.round(
        (new Date(session.scheduled_end).getTime() -
          new Date(session.scheduled_start).getTime()) /
          1000,
      ),
    );
    const ratio = (att.total_seconds_present ?? 0) / planned;
    // >= 80% du temps -> present, sinon partial
    const status: "present" | "partial" = ratio >= 0.8 ? "present" : "partial";

    await supabase
      .from("attendances")
      .update({
        left_at: new Date().toISOString(),
        status,
      } as never)
      .eq("id", att.id);
    return { ok: true, status, ratio };
  });