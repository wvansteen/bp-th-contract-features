import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import { serve } from "inngest/bun";
import { inngest, listFilesFn, processFileFn } from "./inngest";
import { documentStore, pgPool } from "./deps";
import { createContractsRoutes } from "./routes/contracts";

const handler = serve({
  client: inngest,
  functions: [listFilesFn, processFileFn],
});

const app = new Elysia()
  .get("/", () => ({ ok: true }))
  .all("/api/inngest", ({ request }) => handler(request))
  .get("/chat", () => Bun.file("public/index.html"))
  .use(
    await staticPlugin({
      prefix: "/deep-chat",
      assets: "node_modules/deep-chat/dist",
    }),
  )
  .listen(0);

console.log(
  `Elysia listening on http://${app.server?.hostname}:${app.server?.port}`,
);
