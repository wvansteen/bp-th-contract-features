import { Elysia } from "elysia";
import { serve } from "inngest/bun";
import { inngest } from "./inngest";
import { helloWorld } from "./functions/hello";

const handler = serve({ client: inngest, functions: [helloWorld] });

const app = new Elysia()
  .get("/", () => ({ ok: true }))
  .all("/api/inngest", ({ request }) => handler(request))
  .listen(3000);

console.log(`Elysia listening on http://${app.server?.hostname}:${app.server?.port}`);
