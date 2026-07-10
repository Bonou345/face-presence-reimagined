import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";

const COLLECTION = () =>
  process.env.AWS_REKOGNITION_COLLECTION || "classconnect-faces";

function client(): RekognitionClient {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS Rekognition n'est pas configuré.");
  }
  return new RekognitionClient({ region, credentials: { accessKeyId, secretAccessKey } });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const idx = dataUrl.indexOf(",");
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

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
      .select("id, teacher_id, face_similarity_threshold")
      .eq("id", data.sessionId).maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sess || sess.teacher_id !== userId) throw new Error("Non autorisé.");

    const { data: round, error } = await supabase
      .from("face_check_rounds")
      .insert({
        session_id: data.sessionId,
        started_by: userId,
        label: data.label ?? null,
        threshold: (sess as { face_similarity_threshold?: number }).face_similarity_threshold ?? 80,
      })
      .select("id, started_at, threshold").single();
    if (error) throw new Error(error.message);
    return round;
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
    const rk = client();

    let similarity = 0;
    let matched = false;
    let errMsg: string | null = null;

    try {
      const res = await rk.send(new SearchFacesByImageCommand({
        CollectionId: COLLECTION(),
        Image: { Bytes: bytes },
        FaceMatchThreshold: threshold,
        MaxFaces: 1,
      }));
      const m = res.FaceMatches?.[0];
      similarity = Number((m?.Similarity ?? 0).toFixed(2));
      matched = !!m && m.Face?.ExternalImageId === userId && similarity >= threshold;
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      errMsg = err?.name === "InvalidParameterException"
        ? "Aucun visage détecté."
        : (err?.message ?? "Échec Rekognition");
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
