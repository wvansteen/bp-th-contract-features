import { serve } from "inngest/bun";
import { createApp } from "./app";
import { inngest, listFilesFn, processFileFn } from "./inngest";
import { documentStore } from "./deps";
import { createContractsRoutes } from "./routes/contracts";

const handler = serve({
  client: inngest,
  functions: [listFilesFn, processFileFn],
});

const app = createApp({
  inngestHandler: (request) => handler(request),
  contractsRoutes: createContractsRoutes({ inngest, store: documentStore }),
}).listen(0);

console.log(
  `Elysia listening on http://${app.server?.hostname}:${app.server?.port}`,
);
