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

      if (status === 404) {
        throw new NonRetriableError(`Box file ${params.fileId} not found`);
      }

      const retryAfter = error.responseInfo.headers["retry-after"];
      if (status === 429 && retryAfter) {
        const seconds = Number.parseInt(retryAfter, 10);
        const waitMs = Number.isFinite(seconds) ? seconds * 1000 : 60_000;
        throw new RetryAfterError(`Box throttled file ${params.fileId}`, waitMs);
      }

      throw error;
    }
  });

  await steps.run("upsert", () =>
    store.upsert({ documentId: params.fileId, metadata }),
  );
}
