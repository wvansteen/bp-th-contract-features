import { Elysia, status, t } from "elysia";
import type { InngestEventSender } from "../deps";
import type { DocumentStore } from "../db/document-store";

// Inngest allows 1,000 steps per run. list-files spends 2 steps per page of
// 100, so this bound keeps a single run far inside the budget and keeps the
// cost of one request predictable.
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
