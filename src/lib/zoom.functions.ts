import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getZoomAccessToken } from "./zoom.server";

/**
 * Zoom Server-to-Server OAuth integration.
 *
 * Required env vars:
 *   ZOOM_ACCOUNT_ID
 *   ZOOM_CLIENT_ID
 *   ZOOM_CLIENT_SECRET
 *
 * Scopes required on the Zoom app: meeting:write:admin, meeting:read:admin
 */

/**
 * Create (or recreate) a Zoom meeting for an existing session row.
 * RLS applies: only the teacher who owns the session or an admin can update it.
 */
export const createZoomMeetingForSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Fetch the session (RLS: teacher/admin/student-in-class can read)
    const { data: session, error: fetchErr } = await supabase
      .from("sessions")
      .select("id, title, description, scheduled_start, scheduled_end, teacher_id")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!session) throw new Error("Session introuvable");

    const durationMin = Math.max(
      15,
      Math.round(
        (new Date(session.scheduled_end).getTime() -
          new Date(session.scheduled_start).getTime()) /
          60000,
      ),
    );

    let meeting: {
      id: number | string;
      join_url: string;
      start_url: string;
      password?: string;
    };

    try {
      const token = await getZoomAccessToken();
      const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: session.title,
          type: 2, // scheduled meeting
          start_time: new Date(session.scheduled_start).toISOString(),
          duration: durationMin,
          timezone: "UTC",
          agenda: session.description ?? undefined,
          settings: {
            join_before_host: false,
            waiting_room: true,
            mute_upon_entry: true,
            approval_type: 2,
            auto_recording: "none",
            meeting_authentication: false,
          },
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        return {
          ok: false,
          error: `Zoom API a refusé la création (${res.status}): ${txt}`,
        };
      }
      meeting = (await res.json()) as {
        id: number | string;
        join_url: string;
        start_url: string;
        password?: string;
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "La création du lien Zoom a échoué.",
      };
    }

    // Update session with Zoom info (RLS: teacher owner or admin)
    const { error: updErr } = await supabase
      .from("sessions")
      .update({
        zoom_meeting_id: String(meeting.id),
        zoom_join_url: meeting.join_url,
        zoom_start_url: meeting.start_url,
        zoom_password: meeting.password ?? null,
      })
      .eq("id", session.id);
    if (updErr) throw new Error(updErr.message);

    return {
      ok: true,
      meetingId: String(meeting.id),
      joinUrl: meeting.join_url,
      startUrl: meeting.start_url,
      password: meeting.password ?? null,
    };
  });

/**
 * Delete a Zoom meeting (used when a session is cancelled). Best-effort: errors
 * are returned but do not throw for "meeting not found" so the caller can still
 * clear the DB fields.
 */
export const deleteZoomMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ meetingId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const token = await getZoomAccessToken();
    const res = await fetch(
      `https://api.zoom.us/v2/meetings/${encodeURIComponent(data.meetingId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok && res.status !== 404) {
      const txt = await res.text();
      throw new Error(`Zoom DELETE a échoué (${res.status}): ${txt}`);
    }
    return { ok: true };
  });

/**
 * Retourne l'URL Zoom d'une session UNIQUEMENT si :
 * - l'utilisateur est l'enseignant/un enseignant lié à la classe/un admin, OU
 * - l'utilisateur est un élève avec une présence "present" par reconnaissance
 *   faciale datant de moins de FACE_VERIFY_MAX_AGE_MIN minutes.
 * Sinon renvoie { ok: false, error } avec un code interne, et journalise la
 * tentative (autorisée ou refusée) dans `zoom_access_logs`.
 */
const FACE_VERIFY_MAX_AGE_MIN = 15;

export const getSessionJoinUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const log = async (allowed: boolean, reason: string) => {
      await supabaseAdmin.from("zoom_access_logs").insert({
        session_id: data.sessionId,
        user_id: userId,
        allowed,
        reason,
      } as never);
    };

    const { data: session, error: sErr } = await supabaseAdmin
      .from("sessions")
      .select("id, class_id, teacher_id, zoom_join_url")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (sErr || !session) {
      await log(false, "session_not_found");
      return { ok: false as const, error: "Session introuvable." };
    }
    if (!session.zoom_join_url) {
      await log(false, "no_zoom_url");
      return { ok: false as const, error: "Lien Zoom non disponible." };
    }

    // Enseignant/admin : accès direct sans vérification faciale
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (session.teacher_id === userId || isAdmin) {
      await log(true, "teacher_or_admin");
      return { ok: true as const, joinUrl: session.zoom_join_url };
    }
    const { data: ct } = await supabaseAdmin
      .from("class_teachers")
      .select("id")
      .eq("class_id", session.class_id)
      .eq("teacher_id", userId)
      .maybeSingle();
    if (ct) {
      await log(true, "class_teacher");
      return { ok: true as const, joinUrl: session.zoom_join_url };
    }

    // Élève : vérification faciale récente requise
    const { data: att } = await supabaseAdmin
      .from("attendances")
      .select("status, verification_method, updated_at")
      .eq("session_id", data.sessionId)
      .eq("student_id", userId)
      .maybeSingle();

    if (!att || att.status !== "present" || att.verification_method !== "facial_recognition") {
      await log(false, "not_verified");
      return {
        ok: false as const,
        error: "Présence non vérifiée. Validez votre présence par reconnaissance faciale avant de rejoindre.",
      };
    }
    const ageMin = (Date.now() - new Date(att.updated_at as string).getTime()) / 60000;
    if (ageMin > FACE_VERIFY_MAX_AGE_MIN) {
      await log(false, "verification_expired");
      return {
        ok: false as const,
        error: `Vérification expirée (>${FACE_VERIFY_MAX_AGE_MIN} min). Refaites la vérification faciale.`,
      };
    }

    await log(true, "face_verified");
    return { ok: true as const, joinUrl: session.zoom_join_url };
  });
