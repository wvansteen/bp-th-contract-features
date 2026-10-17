import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import { serve } from "inngest/bun";
import { helloWorld } from "./functions/hello";
import { inngest } from "./inngest";

const handler = serve({ client: inngest, functions: [helloWorld] });

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
  .listen(3000);

console.log(`Elysia listening on http://${app.server?.hostname}:${app.server?.port}`);