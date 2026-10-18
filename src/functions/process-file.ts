import { NonRetriableError, RetryAfterError } from "inngest";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore } from "../db/document-store";

export type ProcessFileResult = {
  documentId: string;
  metadata: Record<string, unknown>;
};

export type ProcessFileSteps = {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    if (status === 429 && retryAfter !== undefined) {
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

  await steps.run("upsert", () =>
    store.upsert({ documentId: params.fileId, metadata }),
  );

  return { documentId: params.fileId, metadata };
}
