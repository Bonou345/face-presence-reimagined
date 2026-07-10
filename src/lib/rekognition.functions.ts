import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  RekognitionClient,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  CreateCollectionCommand,
  DescribeCollectionCommand,
} from "@aws-sdk/client-rekognition";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";

/**
 * AWS Rekognition integration.
 *
 * Required secrets:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION             (ex: eu-west-1)
 *   AWS_REKOGNITION_COLLECTION (ex: classconnect-faces)
 */

const COLLECTION = () =>
  process.env.AWS_REKOGNITION_COLLECTION || "classconnect-faces";

function client(): RekognitionClient {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS Rekognition n'est pas configuré. Ajoutez AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY et AWS_REGION dans les secrets du projet.",
    );
  }
  return new RekognitionClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
    requestHandler: new FetchHttpHandler(),
  });
}

async function ensureCollection(rk: RekognitionClient) {
  const name = COLLECTION();
  try {
    await rk.send(new DescribeCollectionCommand({ CollectionId: name }));
  } catch (e: unknown) {
    const err = e as { name?: string };
    if (err?.name === "ResourceNotFoundException") {
      await rk.send(new CreateCollectionCommand({ CollectionId: name }));
    } else {
      throw e;
    }
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const idx = dataUrl.indexOf(",");
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  const bin = Buffer.from(b64, "base64");
  return new Uint8Array(bin);
}

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
    const rk = client();
    await ensureCollection(rk);

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
        await rk.send(
          new DeleteFacesCommand({
            CollectionId: COLLECTION(),
            FaceIds: [existing.rekognition_face_id],
          }),
        );
      } catch {
        // ignore si déjà supprimé
      }
    }

    const res = await rk.send(
      new IndexFacesCommand({
        CollectionId: COLLECTION(),
        Image: { Bytes: bytes },
        ExternalImageId: userId,
        DetectionAttributes: ["DEFAULT"],
        MaxFaces: 1,
        QualityFilter: "AUTO",
      }),
    );

    const record = res.FaceRecords?.[0];
    if (!record?.Face?.FaceId) {
      throw new Error(
        "Aucun visage exploitable détecté. Reprenez la photo de face, bien éclairée.",
      );
    }
    const faceId = record.Face.FaceId;

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

    return { faceId, confidence: record.Face.Confidence ?? null };
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
    const rk = client();

    const bytes = dataUrlToBytes(data.imageDataUrl);
    let res;
    try {
      res = await rk.send(
        new SearchFacesByImageCommand({
          CollectionId: COLLECTION(),
          Image: { Bytes: bytes },
          FaceMatchThreshold: 80,
          MaxFaces: 1,
        }),
      );
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name === "InvalidParameterException") {
        throw new Error("Aucun visage détecté sur la photo.");
      }
      throw new Error(err?.message ?? "Échec Rekognition");
    }

    const match = res.FaceMatches?.[0];
    const externalId = match?.Face?.ExternalImageId;
    const similarity = match?.Similarity ?? 0;

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