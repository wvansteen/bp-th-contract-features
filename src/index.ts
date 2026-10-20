import "../public/index.html" with { type: "file" };
import "../public/lake-county.css" with { type: "file" };
import deepChatBundle from "deep-chat/dist/deepChat.bundle.js" with { type: "file" };
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
  .get("/deep-chat/deepChat.bundle.js", () => Bun.file(deepChatBundle))
  .use(createContractsRoutes({ inngest, store: documentStore }))
  .use(createChatRoutes({ agent: chatAgent }))
  .all("/api/inngest", ({ request }) => handler(request));

export default app;
