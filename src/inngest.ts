import { Inngest } from "inngest";
import { boxClient, boxFolderId, documentStore } from "./deps";
import { listFilesHandler } from "./functions/list-files";
import {
  processFileHandler,
  type ProcessFileSteps,
} from "./functions/process-file";

export const inngest = new Inngest({ id: "contract-features" });

export const listFilesFn = inngest.createFunction(
  {
    id: "list-files",
    triggers: [{ event: "box/list.files" }],
    concurrency: { limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    // No cast needed here. `ListFilesSteps.run` is non-generic and `Jsonify` of
    // a plain-JSON `BoxPage` is `BoxPage`, so the real step object satisfies
    // the interface directly.
    await listFilesHandler(boxClient, step, {
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
    // This cast is load-bearing. `ProcessFileSteps.run` is generic, and
    // Inngest's `step.run` returns `Jsonify<Awaited<T>>`, because a step result
    // is JSON round-tripped between attempts. `tsc` cannot prove the two agree
    // for an unconstrained `T` and emits TS2345, so the narrowing happens here
    // rather than leaking `any` through the handler signature.
    const steps = { run: step.run } as unknown as ProcessFileSteps;

    await processFileHandler(boxClient, steps, documentStore, {
      fileId: event.data.fileId,
    });
  },
);
