import { NonRetriableError, RetryAfterError } from "inngest";
import { BoxApiError } from "box-node-sdk";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore } from "../db/document-store";

export type ProcessFileSteps = {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
};

export async function processFileHandler(
  box: BoxClientPort,
  steps: ProcessFileSteps,
  store: DocumentStore,
  params: { fileId: string },
): Promise<void> {
  const metadata = await steps.run("describe-file", async () => {
    try {
      return await box.describeFile({ fileId: params.fileId });
    } catch (error) {
      if (!(error instanceof BoxApiError)) throw error;
      const status = error.responseInfo.statusCode;

      // A deleted or moved file will never exist again. Retrying just burns
      // three attempts and leaves a permanently red run.
      if (status === 404) {
        throw new NonRetriableError(`Box file ${params.fileId} not found`);
      }

      // Box sends Retry-After as either delta-seconds or an HTTP-date.
      // `parseInt` on a date yields NaN, and the guard is not optional: the
      // RetryAfterError constructor divides by 1000 and throws a plain Error
      // when the result is not finite, which would turn Box's backoff into an
      // immediate retry. RetryAfterError takes milliseconds and its message
      // argument first, and stores the value back as a string of seconds.
      const retryAfter = error.responseInfo.headers["retry-after"];
      if (status === 429 && retryAfter) {
        const seconds = Number.parseInt(retryAfter, 10);
        const waitMs = Number.isFinite(seconds) ? seconds * 1000 : 60_000;
        throw new RetryAfterError(
          `Box throttled file ${params.fileId}`,
          waitMs,
        );
      }

      throw error;
    }
  });

  await steps.run("upsert", () =>
    store.upsert({ documentId: params.fileId, metadata }),
  );
}
