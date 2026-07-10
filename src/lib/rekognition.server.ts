import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  DescribeCollectionCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";

const DEFAULT_COLLECTION = "classconnect-faces";
const FALLBACK_REGION = "eu-west-1";
const UNREACHABLE_REGIONS = new Set(["eu-north-1"]);

export type RekognitionRuntime = {
  client: RekognitionClient;
  collection: string;
  region: string;
};

export function getRekognitionRuntime(): RekognitionRuntime {
  const configuredRegion = process.env.AWS_REGION?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!configuredRegion || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS Rekognition n'est pas configuré. Ajoutez AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY et AWS_REGION dans les secrets du projet.",
    );
  }

  const region = UNREACHABLE_REGIONS.has(configuredRegion)
    ? FALLBACK_REGION
    : configuredRegion;

  return {
    region,
    collection: process.env.AWS_REKOGNITION_COLLECTION || DEFAULT_COLLECTION,
    client: new RekognitionClient({
      region,
      endpoint: `https://rekognition.${region}.amazonaws.com`,
      useDualstackEndpoint: false,
      credentials: { accessKeyId, secretAccessKey },
      requestHandler: new FetchHttpHandler({
        requestTimeout: 30_000,
      }),
    }),
  };
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const idx = dataUrl.indexOf(",");
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export function rekognitionErrorMessage(error: unknown, region: string): string {
  const err = error as {
    name?: string;
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string };
  };
  const combined = `${err?.name ?? ""} ${err?.code ?? ""} ${err?.message ?? ""} ${err?.cause?.code ?? ""} ${err?.cause?.message ?? ""}`.toLowerCase();

  if (err?.name === "InvalidParameterException") {
    return "Aucun visage détecté sur la photo.";
  }

  if (
    combined.includes("fetch failed") ||
    combined.includes("getaddrinfo") ||
    combined.includes("enotfound") ||
    combined.includes("network") ||
    combined.includes("timeout")
  ) {
    return `Impossible de joindre AWS Rekognition (${region}). Vérifiez que AWS_REGION utilise une région disponible comme eu-west-1, eu-central-1 ou us-east-1.`;
  }

  return err?.message ?? "Échec AWS Rekognition";
}

export async function ensureRekognitionCollection(runtime: RekognitionRuntime) {
  try {
    await runtime.client.send(
      new DescribeCollectionCommand({ CollectionId: runtime.collection }),
    );
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err?.name !== "ResourceNotFoundException") {
      throw error;
    }
    await runtime.client.send(
      new CreateCollectionCommand({ CollectionId: runtime.collection }),
    );
  }
}

export async function deleteRekognitionFace(
  runtime: RekognitionRuntime,
  faceId: string,
) {
  await runtime.client.send(
    new DeleteFacesCommand({
      CollectionId: runtime.collection,
      FaceIds: [faceId],
    }),
  );
}

export async function indexRekognitionFace(
  runtime: RekognitionRuntime,
  bytes: Uint8Array,
  externalImageId: string,
) {
  const res = await runtime.client.send(
    new IndexFacesCommand({
      CollectionId: runtime.collection,
      Image: { Bytes: bytes },
      ExternalImageId: externalImageId,
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

  return {
    faceId: record.Face.FaceId,
    confidence: record.Face.Confidence ?? null,
  };
}

export async function searchRekognitionFace(
  runtime: RekognitionRuntime,
  bytes: Uint8Array,
  threshold: number,
) {
  const res = await runtime.client.send(
    new SearchFacesByImageCommand({
      CollectionId: runtime.collection,
      Image: { Bytes: bytes },
      FaceMatchThreshold: threshold,
      MaxFaces: 1,
    }),
  );

  const match = res.FaceMatches?.[0];
  return {
    externalImageId: match?.Face?.ExternalImageId,
    similarity: match?.Similarity ?? 0,
  };
}