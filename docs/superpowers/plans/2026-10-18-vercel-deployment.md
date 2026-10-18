# Plan: Vercel deployment wiring

Context: `bp-th-contract-features` deploys to Vercel (a git-connected project,
production branch `main`) running on the Bun runtime against Neon Postgres, with
Inngest in production mode. This plan makes the repo deployable: the Elysia app
becomes the Vercel entry point, the local listener moves to its own file,
migrations run in the Vercel build step against the unpooled Neon URL, and the
environment contract is documented. Local development keeps working exactly as
today: dynamic ports from the compose stack, injected by the mise tasks.

## Global Constraints

- Style locks, enforced by ESLint as errors: `const` only (no `let` or `var`),
  no assignment to variables, parameters, or object properties, no loops, no
  `any` anywhere including type assertions, no `eslint-disable`, `@ts-ignore`,
  `@ts-expect-error`, or non-null `!`.
- Dependency injection over env access: never read env vars or construct
  low-level clients inside a function. `src/config/env.ts` `loadEnv()` and the
  composition root `src/deps.ts` stay the app's only env readers.
  `drizzle.config.ts` is the single sanctioned exception to that rule.
- No connection strings, ports, or host names hard-coded in committed files.
  Values come from the environment at runtime. Only env var NAMES appear in
  code. The local stack's `bp:bp` URL literals already in `mise.toml` are the
  accepted existing pattern for the mise tasks and may be extended there.
- The startup log line must stay exactly
  `Elysia listening on http://${app.server?.hostname}:${app.server?.port}`.
  `mise.toml` greps that line and derives the port with `PORT=${LINE##*:}`.
- Gates must pass before every commit: `bun run format:check`, `bun run lint`,
  `bun run typecheck`, `bun run build`, `bun test`. Baseline is 17 tests green.
- Vercel entry detection recognizes only `app`, `index`, or `server` at the repo
  root or under `src/`, and requires a default export of the Elysia app with no
  `listen()` call. `src/index.ts` is the Vercel entry. `src/main.ts` is the
  local listener precisely because `main` is not a recognized name.
- ADRs copy `docs/decisions/adr-template.md` (MADR v4) into
  `docs/decisions/NNNN-short-title.md`, lean: two to three sentences of context,
  in-scope drivers and options only, the outcome with a one-line why, terse
  consequences, and a one-line confirmation check. Never delete ADR history.
- README stays standard-readme compliant: sections in the spec's order, and the
  Table of Contents matches the headings. CHANGELOG stays Keep a Changelog under
  `[Unreleased]`.
- Prose never uses em dashes.
- Database verification is local only. Never run migrations against Neon; the
  first Vercel build applies them.

## Task 1: Split the Vercel entry from the local listener

Vercel's Elysia support requires the app as a default export and explicitly does
not support `app.listen()`. Move the listener out so one code base serves both
runtimes.

`src/index.ts` becomes exactly:

```ts
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
  .get("/lake-county.css", () => Bun.file("public/lake-county.css"))
  .use(
    await staticPlugin({
      prefix: "/deep-chat",
      assets: "node_modules/deep-chat/dist",
    }),
  )
  .use(createContractsRoutes({ inngest, store: documentStore }))
  .all("/api/inngest", ({ request }) => handler(request));

export default app;
```

`src/main.ts` is created as exactly:

```ts
import app from "./index";

app.listen(0);

console.log(
  `Elysia listening on http://${app.server?.hostname}:${app.server?.port}`,
);
```

`package.json`: the `dev` script becomes `bun --hot src/main.ts`. Nothing else
in `package.json` changes.

Acceptance: all gates pass; the route surface is unchanged; the startup log line
keeps its exact format.

## Task 2: Migration and connection env wiring

Migrations must run in the Vercel build step against Neon's unpooled URL while
the running app keeps the pooled one, and the same script must run locally
against the compose stack. Name env vars in code, never values.

`package.json`: the `db:migrate` script becomes `bun x drizzle-kit migrate`
(dropping `--env-file=.env`, so ambient env supplies the values in both
environments).

`drizzle.config.ts` becomes exactly:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
```

`mise.toml`: the `db:migrate` task exports both names from the compose stack so
the local target is unambiguous, adding exactly one line to its `run` body:

```toml
export DATABASE_URL_UNPOOLED="$DATABASE_URL"
```

placed after the existing `export DATABASE_URL=...` line. Nothing else in
`mise.toml` changes.

Acceptance: all gates pass; `bun run db:migrate` with `DATABASE_URL` exported in
the shell targets that URL; with `DATABASE_URL_UNPOOLED` exported it targets
that one instead.

## Task 3: Document the environment contract in .env.example

`.env.example` becomes exactly:

```
# Names only: local values come from the mise tasks.

BOX_APP_TOKEN=
BOX_FOLDER_ID=
DATABASE_URL=

# Migration target.
DATABASE_URL_UNPOOLED=

# Vercel only; local uses INNGEST_DEV.
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

Acceptance: `bun run format:check` passes (`.env.example` is not
prettier-ignored) and no real value appears anywhere in the file.

## Task 4: vercel.json

Create `vercel.json` as exactly:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "bunVersion": "1.x",
  "buildCommand": "bun run db:migrate"
}
```

Rationale recorded here for the reviewer: `bunVersion` selects the Bun runtime
(`1.x` and `1.4.x` are the only valid values). `buildCommand` runs migrations in
the build step on `DATABASE_URL_UNPOOLED` from the dashboard. There is no
`functions` block on purpose: its glob keys must match Vercel Function source
files inside the `api` directory, and this app is the framework-mounted export
of `src/index.ts`, which such keys cannot address (Vercel error
`unused_function`). The page assets ride with whatever the mounted function
carries, and the first deploy checks them.

Acceptance: `bun run lint` and `bun run format:check` pass (the file is JSON in
the prettier-checked set), and the JSON is exactly as above.

## Task 5: ADR 0007, README, and CHANGELOG

1. ADR `docs/decisions/0007-deploy-on-vercel-functions-bun-runtime.md`, copied
   from `docs/decisions/adr-template.md`, `status: accepted`. Decision: deploy
   the Elysia app to Vercel Functions on the Bun runtime, with the app as a
   default export and the local listener in `src/main.ts`; run migrations in the
   Vercel build step against the unpooled Neon URL; serve the page assets from
   the function bundle via `includeFiles`. Context: the PoC needs managed
   hosting for the page, the API, and the Inngest endpoint, with Neon Postgres
   as the database. Consequences: entry split, env contract in `.env.example`,
   first deploy must sync Inngest. Confirmation line: a file or command check.
   Lean per the template, no em dashes.
2. `README.md`: keep standard-readme order and a Table of Contents that matches
   the headings. Update `Install` with the four env names (`BOX_APP_TOKEN`,
   `BOX_FOLDER_ID`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`) and where each
   comes from (local mise injection for the two database ones, Vercel project
   environment for production). Add a `Deployment` section after `Development`
   covering: Vercel project is git-connected with `main` as production branch,
   `vercel.json` selects the Bun runtime and runs `bun run db:migrate` in the
   build step against `DATABASE_URL_UNPOOLED`, and after the first deploy
   Inngest must be synced with `curl -X PUT https://<host>/api/inngest`. Do not
   invent URLs.
3. `CHANGELOG.md`: one bullet under `[Unreleased]` in `Added`, exactly:
   `Vercel deployment: one Vercel Function on the Bun runtime, migrations applied at build time.`

Acceptance: README headings match the ToC; the ADR is the only new file in
`docs/decisions/`; the changelog bullet exists verbatim under `Added`.

## Task 6: Local verification only

No code changes. Run and record, with output excerpts in the report:

1. `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run build`,
   `bun test` (17 tests expected).
2. `mise run db:migrate` with the local stack up: confirm the migration applies
   to the compose Postgres.
3. `bun run dev` under the mise dev task long enough to see
   `Elysia listening on ...`, then the Inngest sync `curl -X PUT` the task
   performs, then `curl` the root path and confirm the Lake County page HTML
   comes back.
4. Prove the ambient-env path without touching Neon: run `bun run db:migrate`
   with `DATABASE_URL` exported to the compose URL and confirm it targets it;
   run it with nothing exported and confirm it fails with a clear config error
   rather than a crash.
5. `mise run dev:teardown`.

Acceptance: every command's result is in the report with its output; Neon is
never contacted; the containers are torn down at the end.
