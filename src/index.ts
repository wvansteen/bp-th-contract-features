import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import { serve } from "inngest/bun";
import { inngest, listFilesFn, processFileFn } from "./inngest";
import { documentStore } from "./deps";
import { createContractsRoutes } from "./routes/contracts";

const handler = serve({
  client: inngest,
  functions: [listFilesFn, processFileFn],
});

const app = new Elysia()
  .get("/", () => Bun.file("public/index.html"))
  .all("/api/inngest", ({ request }) => handler(request))
  .get(
    "/chat",
    ({ request }) =>
      new Response(null, {
        status: 302,
        headers: { location: new URL("/", request.url).toString() },
      }),
  )
  .get("/lake-county.css", () => Bun.file("public/lake-county.css"))
  .use(
    await staticPlugin({
      prefix: "/deep-chat",
      assets: "node_modules/deep-chat/dist",
    }),
  )
  .use(createContractsRoutes({ inngest, store: documentStore }))
  .listen(0);

console.log(
  `Elysia listening on http://${app.server?.hostname}:${app.server?.port}`,
);
