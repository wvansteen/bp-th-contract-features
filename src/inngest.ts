import { Inngest } from "inngest";
import { boxClient, boxFolderId, documentStore } from "./deps";
import { listFilesHandler, type ListFilesSteps } from "./functions/list-files";
import { processFileHandler, type ProcessFileSteps } from "./functions/process-file";

export const inngest = new Inngest({ id: "contract-features" });

export const listFilesFn = inngest.createFunction(
  {
    id: "list-files",
    triggers: [{ event: "box/list.files" }],
    concurrency: { limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    const steps = {
      run: step.run,
      sendEvent: step.sendEvent,
    } as unknown as ListFilesSteps;

    await listFilesHandler(boxClient, steps, {
      folderId: boxFolderId,
      maxDocuments: event.data.maxDocuments,
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
    const steps = { run: step.run } as unknown as ProcessFileSteps;

    await processFileHandler(boxClient, steps, documentStore, {
      fileId: event.data.fileId,
    });
  },
);
