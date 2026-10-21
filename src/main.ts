import app from "./index";

app.get("/deepChat.bundle.js", () =>
  Bun.file("node_modules/deep-chat/dist/deepChat.bundle.js"),
);

app.listen(0);

console.log(
  `Elysia listening on http://${app.server?.hostname}:${app.server?.port}`,
);
