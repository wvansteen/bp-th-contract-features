import { NonRetriableError, RetryAfterError } from "inngest";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore, StoredDocument } from "../db/document-store";

export type ProcessFileResult = {
  documentId: string;
  metadata: Record<string, unknown>;
  upserted: StoredDocument;
};

export type ProcessFileSteps = {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredDocument(value: unknown): value is StoredDocument {
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

// Box's SDK throws a `BoxApiError`, but the handler only needs the shape it
// reads. A structural check keeps the SDK class out of the function boundary.
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

    // A deleted or moved file will never exist again. Retrying just burns
    // three attempts and leaves a permanently red run.
    if (status === 404) {
      throw new NonRetriableError(`Box file ${fileId} not found`);
    }

    // Box sends Retry-After as either delta-seconds or an HTTP-date.
    // `parseInt` on a date yields NaN, and the guard is not optional: the
    // RetryAfterError constructor divides by 1000 and throws a plain Error
    // when the result is not finite, which would turn Box's backoff into an
    // immediate retry. RetryAfterError takes milliseconds and its message
    // argument first, and stores the value back as a string of seconds.
    const retryAfter = error.responseInfo.headers["retry-after"];
    // An empty header is treated as absent, matching the pre-rewrite truthy
    // check and the bare-429 path below.
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

  // The document is the upsert step's result as well as its input, so the
  // write is observable from the handler's return rather than only from the
  // store. Removing the step would leave `upserted` undefined and fail the
  // guard below.
  const document: StoredDocument = { documentId: params.fileId, metadata };
  const upserted = await steps.run("upsert", async () => {
    await store.upsert(document);
    return document;
  });

  if (!isStoredDocument(upserted)) {
    throw new Error(
      `upsert did not return a stored document for ${params.fileId}`,
    );
  }

  return { documentId: params.fileId, metadata, upserted };
}
