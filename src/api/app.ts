import { Elysia } from "elysia";
import type { ChatAgent } from "./chat/agent";
import type { DocumentStore } from "./db/document-store";
import type { InngestEventSender } from "./deps";
import { createChatRoutes } from "./routes/chat";
import { createContractsRoutes } from "./routes/contracts";

export function createApi(deps: {
  inngest: InngestEventSender;
  inngestHandler: (request: Request) => Promise<Response>;
  store: DocumentStore;
  agent: ChatAgent;
}) {
  return new Elysia({ prefix: "/api" })
    .use(createContractsRoutes({ inngest: deps.inngest, store: deps.store }))
    .use(createChatRoutes({ agent: deps.agent }))
    .all("/inngest", ({ request }) => deps.inngestHandler(request));
}
