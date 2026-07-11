import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

type ZoomToken = { access_token: string; expires_in: number };

async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID?.trim();
  const clientId = process.env.ZOOM_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim();
  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      "Zoom n'est pas configuré. Ajoute ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET dans les secrets du projet.",
    );
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    let zoomError = txt;
    try {
      const parsed = JSON.parse(txt) as { error?: string; reason?: string };
      zoomError = parsed.reason || parsed.error || txt;
    } catch {
      // Keep Zoom's raw text when it is not JSON.
    }

    if (res.status === 400 && txt.includes("invalid_client")) {
      throw new Error(
        "Zoom refuse les identifiants configurés. Vérifie que ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID et ZOOM_CLIENT_SECRET proviennent du même app Zoom Server-to-Server OAuth, puis remplace les secrets.",
      );
    }

    throw new Error(`Zoom OAuth a échoué (${res.status}): ${zoomError}`);
  }
  const json = (await res.json()) as ZoomToken;
  return json.access_token;
}

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
      throw new Error(`Zoom API a refusé la création (${res.status}): ${txt}`);
    }
    const meeting = (await res.json()) as {
      id: number | string;
      join_url: string;
      start_url: string;
      password?: string;
    };

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
