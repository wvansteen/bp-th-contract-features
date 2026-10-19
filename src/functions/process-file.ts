import { NonRetriableError, RetryAfterError } from "inngest";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore, StoredDocument } from "../db/document-store";
import type { ClassifySmartFeatures } from "../smart-features/classify";

export type SkippedDocument = { documentId: string; skipped: "not-a-pdf" };

export type ProcessedDocument = {
  documentId: string;
  metadata: Record<string, unknown>;
  smartFeatures: Record<string, string>;
  upserted: Pick<StoredDocument, "documentId" | "metadata">;
};

export type ProcessFileResult = SkippedDocument | ProcessedDocument;

export type ProcessFileSteps = {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredDocument(
  value: unknown,
): value is Pick<StoredDocument, "documentId" | "metadata"> {
  return (
    isRecord(value) &&
    typeof value.documentId === "string" &&
    isRecord(value.metadata)
  );
}

type BoxApiFailure = {
  responseInfo: {
    statusCode: number;
    headers: Record<string, string | undefined>;
  };
};

function isBoxApiFailure(error: unknown): error is BoxApiFailure {
  if (!isRecord(error)) return false;
  const { responseInfo } = error;
  if (!isRecord(responseInfo)) return false;
  return (
    typeof responseInfo.statusCode === "number" &&
    isRecord(responseInfo.headers)
  );
}

async function describeFile(
  box: BoxClientPort,
  fileId: string,
): Promise<unknown> {
  try {
    return await box.describeFile({ fileId });
  } catch (error) {
    if (!isBoxApiFailure(error)) throw error;
    const status = error.responseInfo.statusCode;

    if (status === 404) {
      throw new NonRetriableError(`Box file ${fileId} not found`);
    }

    const retryAfter = error.responseInfo.headers["retry-after"];
    if (status === 429 && retryAfter) {
      const seconds = Number.parseInt(retryAfter, 10);
      const waitMs = Number.isFinite(seconds) ? seconds * 1000 : 60_000;
      throw new RetryAfterError(`Box throttled file ${fileId}`, waitMs);
    }

    throw error;
  }
}

export async function processFileHandler(
  box: BoxClientPort,
  steps: ProcessFileSteps,
  store: DocumentStore,
  classify: ClassifySmartFeatures,
  params: { fileId: string },
): Promise<ProcessFileResult> {
  const described = await steps.run("describe-file", () =>
    describeFile(box, params.fileId),
  );

  if (!isRecord(described)) {
    throw new Error(
      `Box returned an unexpected shape for file ${params.fileId}`,
    );
  }

  const metadata = described;
  const filename =
    typeof metadata.name === "string" ? metadata.name : params.fileId;

  if (!filename.toLowerCase().endsWith(".pdf")) {
    console.warn(`Skipping non-PDF file ${params.fileId} (${filename})`);
    return { documentId: params.fileId, skipped: "not-a-pdf" };
  }

  const document = await box.downloadFile({ fileId: params.fileId });

  const upserted = await steps.run("upsert", async () => {
    const written = { documentId: params.fileId, metadata };
    await store.upsert({ ...written, document, smartFeatures: {} });
    return written;
  });

  if (!isStoredDocument(upserted)) {
    throw new Error(
      `upsert did not return a stored document for ${params.fileId}`,
    );
  }

  const smartFeatures = await classify({ filename, document });
  await store.upsert({
    documentId: params.fileId,
    metadata,
    document,
    smartFeatures,
  });

  return { documentId: params.fileId, metadata, smartFeatures, upserted };
}
