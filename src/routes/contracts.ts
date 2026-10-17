import { Elysia, status, t } from "elysia";
import type { InngestEventSender } from "../deps";
import type { DocumentStore } from "../db/document-store";

// list-files emits one event per file and stops once `maxDocuments` files
// have been handled, so this cap bounds one run's fan-out at 1,000 per-file
// events. At 100 entries per page, reaching that cap takes 10 pages when the
// pages contain only files.
const MAX_DOCUMENTS_PER_RUN = 1000;

export function createContractsRoutes(deps: {
  inngest: InngestEventSender;
  store: DocumentStore;
}) {
  return new Elysia()
    .post(
      "/process-contracts",
      async ({ body }) => {
        await deps.inngest.send({
          name: "box/list.files",
          data: { maxDocuments: body.maxDocuments },
        });
        return status(201);
      },
      {
        body: t.Object({
          maxDocuments: t.Number({
            minimum: 1,
            maximum: MAX_DOCUMENTS_PER_RUN,
            multipleOf: 1,
          }),
        }),
      },
    )
    .get("/contracts", async () => deps.store.listAll());
}
