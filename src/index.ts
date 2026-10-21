import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import { serve } from "inngest/bun";
import { inngest, listFilesFn, processFileFn } from "./inngest";
import { chatAgent, documentStore } from "./deps";
import { createChatRoutes } from "./routes/chat";
import { createContractsRoutes } from "./routes/contracts";

const handler = serve({
  client: inngest,
  functions: [listFilesFn, processFileFn],
});

const app = new Elysia()
  .use(staticPlugin({ assets: "public", prefix: "", indexHTML: true }))
  .use(createContractsRoutes({ inngest, store: documentStore }))
  .use(createChatRoutes({ agent: chatAgent }))
  .all("/api/inngest", ({ request }) => handler(request));

export default app;
