import { staticPlugin } from "@elysiajs/static";
import { type AnyElysia, Elysia } from "elysia";

export type InngestEventHandler = (request: Request) => Promise<Response>;

// The contracts routes are an Elysia instance (see createContractsRoutes), so
// they mount as a plugin and can be swapped for a stub in tests. The cast to
// `Elysia["use"]`'s parameter is the one place the plugin's route generics are
// widened; the chain's own handler types stay concrete.
export type AppPlugin = AnyElysia;

export function createApp(deps: {
  inngestHandler: InngestEventHandler;
  contractsRoutes: AppPlugin;
}) {
  return new Elysia()
    .get("/", () => Bun.file("public/index.html"))
    .all("/api/inngest", ({ request }) => deps.inngestHandler(request))
    .use(deps.contractsRoutes as Parameters<Elysia["use"]>[0])
    .get(
      "/chat",
      ({ request }) =>
        new Response(null, {
          status: 302,
          headers: { location: new URL("/", request.url).toString() },
        }),
    )
    .use(
      staticPlugin({
        prefix: "/deep-chat",
        assets: "node_modules/deep-chat/dist",
      }),
    );
}
