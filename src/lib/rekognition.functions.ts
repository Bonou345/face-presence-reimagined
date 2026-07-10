import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  dataUrlToBytes,
  deleteRekognitionFace,
  ensureRekognitionCollection,
  getRekognitionRuntime,
  indexRekognitionFace,
  rekognitionErrorMessage,
  searchRekognitionFace,
} from "@/lib/rekognition.server";

/**
 * AWS Rekognition integration.
 *
 * Required secrets:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION             (ex: eu-west-1)
 *   AWS_REKOGNITION_COLLECTION (ex: classconnect-faces)
 */

/**
 * Index la photo de référence de l'utilisateur dans la collection AWS,
 * met à jour la table face_profiles avec le rekognition_face_id retourné.
 */
export const indexStudentFace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        imageDataUrl: z.string().min(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rk = getRekognitionRuntime();
    try {
      await ensureRekognitionCollection(rk);
    } catch (e: unknown) {
      throw new Error(rekognitionErrorMessage(e, rk.region));
    }

    const bytes = dataUrlToBytes(data.imageDataUrl);
    if (bytes.length > 5 * 1024 * 1024) {
      throw new Error("Image trop volumineuse (max 5 Mo).");
    }

    // Supprime d'abord l'ancien Face (si présent) pour éviter les doublons
    const { data: existing } = await supabase
      .from("face_profiles")
      .select("rekognition_face_id")
      .eq("student_id", userId)
      .maybeSingle();
    if (existing?.rekognition_face_id) {
      try {
        await deleteRekognitionFace(rk, existing.rekognition_face_id);
      } catch {
        // ignore si déjà supprimé
      }
    }

    let indexed;
    try {
      indexed = await indexRekognitionFace(rk, bytes, userId);
    } catch (e: unknown) {
      throw new Error(rekognitionErrorMessage(e, rk.region));
    }
    const faceId = indexed.faceId;

    // Upload de la photo de référence dans le bucket privé
    const path = `${userId}/reference.jpg`;
    const blob = new Blob([bytes as BlobPart], { type: "image/jpeg" });
    const upload = await supabase.storage
      .from("face-images")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (upload.error) {
      // non bloquant — on garde l'indexation
      console.error("storage upload error", upload.error);
    }
    const { data: signed } = await supabase.storage
      .from("face-images")
      .createSignedUrl(path, 60 * 60 * 24 * 365);

    const { error: upErr } = await supabase.from("face_profiles").upsert(
      {
        student_id: userId,
        rekognition_face_id: faceId,
        rekognition_external_id: userId,
        image_url: signed?.signedUrl ?? null,
        indexed_at: new Date().toISOString(),
      },
      { onConflict: "student_id" },
    );
    if (upErr) throw new Error(upErr.message);

    return { faceId, confidence: indexed.confidence };
  });

/**
 * Compare une capture webcam à la collection. Si la meilleure correspondance
 * appartient à l'élève courant avec une similarité >= 80%, on enregistre
 * la présence (status=present, verification_method=facial_recognition).
 */
export const verifyFaceAndCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sessionId: z.string().uuid(),
        imageDataUrl: z.string().min(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rk = getRekognitionRuntime();

    const bytes = dataUrlToBytes(data.imageDataUrl);
    let match;
    try {
      match = await searchRekognitionFace(rk, bytes, 80);
    } catch (e: unknown) {
      throw new Error(rekognitionErrorMessage(e, rk.region));
    }

    const externalId = match.externalImageId;
    const similarity = match.similarity;

    if (!match || externalId !== userId || similarity < 80) {
      // Marque comme pending pour audit, mais ne valide pas
      await supabase.from("attendances").upsert(
        {
          session_id: data.sessionId,
          student_id: userId,
          status: "pending",
          verification_method: "pending",
          confidence_score: similarity ? Number(similarity.toFixed(2)) : null,
          notes: "Échec vérification faciale",
        } as never,
        { onConflict: "session_id,student_id" },
      );
      throw new Error(
        `Visage non reconnu (similarité ${similarity.toFixed(0)}%). Vérifiez l'éclairage et réessayez.`,
      );
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("attendances").upsert(
      {
        session_id: data.sessionId,
        student_id: userId,
        status: "present",
        verification_method: "facial_recognition",
        confidence_score: Number(similarity.toFixed(2)),
        joined_at: now,
        last_seen_at: now,
      } as never,
      { onConflict: "session_id,student_id" },
    );
    if (error) throw new Error(error.message);

    return { ok: true, similarity: Number(similarity.toFixed(2)) };
  });