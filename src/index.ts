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
  .get("/", () => Bun.file("public/index.html"))
  .get("/lake-county.css", () => Bun.file("public/lake-county.css"))
  .use(
    await staticPlugin({
      prefix: "/deep-chat",
      assets: "node_modules/deep-chat/dist",
    }),
  )
  .use(createContractsRoutes({ inngest, store: documentStore }))
  .use(createChatRoutes({ agent: chatAgent }))
  .all("/api/inngest", ({ request }) => handler(request));

export default app;
