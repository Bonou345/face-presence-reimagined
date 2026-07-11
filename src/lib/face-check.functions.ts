import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  dataUrlToBytes,
  getRekognitionRuntime,
  rekognitionErrorMessage,
  searchRekognitionFace,
} from "@/lib/rekognition.server";

/** Enseignant : lance une nouvelle vérification faciale ponctuelle. */
export const startFaceCheckRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      sessionId: z.string().uuid(),
      label: z.string().max(120).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sess, error: sErr } = await supabase
      .from("sessions")
      .select("id, teacher_id, class_id, face_similarity_threshold")
      .eq("id", data.sessionId).maybeSingle();
    if (sErr) return { ok: false, error: sErr.message };
    if (!sess) return { ok: false, error: "Session introuvable." };

    let authorized = sess.teacher_id === userId;
    if (!authorized) {
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      authorized = !!isAdmin;
    }
    if (!authorized && sess.class_id) {
      const { data: link } = await supabase
        .from("class_teachers")
        .select("teacher_id")
        .eq("class_id", sess.class_id)
        .eq("teacher_id", userId)
        .maybeSingle();
      authorized = !!link;
    }
    if (!authorized) {
      return {
        ok: false,
        error: "Seul l'enseignant responsable de cette session, un enseignant associé à la classe ou un administrateur peut lancer cette vérification.",
      };
    }


    const { data: round, error } = await supabase
      .from("face_check_rounds")
      .insert({
        session_id: data.sessionId,
        started_by: userId,
        label: data.label ?? null,
        threshold: (sess as { face_similarity_threshold?: number }).face_similarity_threshold ?? 80,
      })
      .select("id, started_at, threshold").single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, round };
  });

/** Enseignant : clôt la vérification en cours. */
export const endFaceCheckRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ roundId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("face_check_rounds")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", data.roundId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Élève : soumet une capture pour un round donné. */
export const submitFaceCheckResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      roundId: z.string().uuid(),
      imageDataUrl: z.string().min(50),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: round, error: rErr } = await supabase
      .from("face_check_rounds")
      .select("id, session_id, ended_at, threshold")
      .eq("id", data.roundId).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!round) throw new Error("Vérification introuvable.");
    if (round.ended_at) throw new Error("La vérification est terminée.");

    const threshold = (round as { threshold?: number | null }).threshold ?? 80;
    const bytes = dataUrlToBytes(data.imageDataUrl);
    const rk = getRekognitionRuntime();

    let similarity = 0;
    let matched = false;
    let errMsg: string | null = null;

    try {
      const result = await searchRekognitionFace(rk, bytes, threshold);
      similarity = Number(result.similarity.toFixed(2));
      matched = result.externalImageId === userId && similarity >= threshold;
    } catch (e: unknown) {
      errMsg = rekognitionErrorMessage(e, rk.region);
    }

    // enregistre le résultat de ce round
    const { error: insErr } = await supabase.from("face_check_results").upsert(
      {
        round_id: data.roundId,
        student_id: userId,
        present: matched,
        similarity: similarity || null,
        error: errMsg,
      },
      { onConflict: "round_id,student_id" },
    );
    if (insErr) throw new Error(insErr.message);

    // Si succès -> met aussi à jour la présence globale
    if (matched) {
      const now = new Date().toISOString();
      await supabase.from("attendances").upsert(
        {
          session_id: round.session_id,
          student_id: userId,
          status: "present",
          verification_method: "facial_recognition",
          confidence_score: similarity,
          joined_at: now,
          last_seen_at: now,
        },
        { onConflict: "session_id,student_id" },
      );
    }

    return { present: matched, similarity, error: errMsg };
  });
