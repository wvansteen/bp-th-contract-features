import app from "./index";

app.listen(0);

console.log(
  `Elysia listening on http://${app.server?.hostname}:${app.server?.port}`,
);
