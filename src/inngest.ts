import { Inngest } from "inngest";
import { boxClient, boxFolderId, documentStore } from "./deps";
import { listFilesHandler } from "./functions/list-files";
import { processFileHandler } from "./functions/process-file";

export const inngest = new Inngest({ id: "contract-features" });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMaxDocuments(data: unknown): number {
  if (isRecord(data) && typeof data.maxDocuments === "number") {
    return data.maxDocuments;
  }
  throw new Error("box/list.files requires a numeric maxDocuments");
}

function readFileId(data: unknown): string {
  if (isRecord(data) && typeof data.fileId === "string") {
    return data.fileId;
  }
  throw new Error("box/process.file requires a string fileId");
}

export const listFilesFn = inngest.createFunction(
  {
    id: "list-files",
    triggers: [{ event: "box/list.files" }],
    concurrency: { limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    await listFilesHandler(boxClient, step, {
      folderId: boxFolderId,
      maxDocuments: readMaxDocuments(event.data),
    });
  },
);

export const processFileFn = inngest.createFunction(
  {
    id: "process-file",
    triggers: [{ event: "box/process.file" }],
    concurrency: { limit: 1 },
    throttle: { limit: 1000, period: "1m" },
    retries: 3,
  },
  async ({ event, step }) => {
    await processFileHandler(boxClient, step, documentStore, {
      fileId: readFileId(event.data),
    });
  },
);
