import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import api from "./api";

const app = new Elysia()
  .use(staticPlugin({ assets: "public", prefix: "", indexHTML: true }))
  .use(api)
  .get("/deepChat.bundle.js", () =>
    Bun.file("node_modules/deep-chat/dist/deepChat.bundle.js"),
  );

app.listen(0);

console.log(
  `Elysia listening on http://${app.server?.hostname}:${app.server?.port}`,
);
