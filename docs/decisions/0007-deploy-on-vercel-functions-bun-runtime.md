---
status: accepted
date: 2026-10-18
decision-makers: William Van Steen
---

# Deploy on Vercel Functions with the Bun runtime

## Context and Problem Statement

The PoC needs managed hosting for the page, the API, and the Inngest endpoint,
with Neon Postgres as the database. The app only runs locally today, so the
hosting model also decides how it is entered and how migrations reach the
database.

## Decision Drivers

- One host for the static page, the JSON API, and the Inngest endpoint
- The Bun runtime, since Elysia and the Inngest Bun integration depend on it
- Migrations applied before the deployed function serves traffic

## Considered Options

- Vercel Functions with the Bun runtime
- Vercel Functions with the Node runtime
- A container host running the Bun server

## Decision Outcome

Chosen option: "Vercel Functions with the Bun runtime", because the existing
Elysia app exports directly as a function and the platform's build step can run
the migrations before traffic arrives.

The app is the default export of `src/index.ts`; `src/main.ts` keeps the local
listener. The build step runs `bun run db:migrate` against the unpooled Neon
URL. The app serves `public/` and the Deep Chat assets itself; `vercel.json`
`functions` cannot reach a mounted app, so no per-function config applies.

### Consequences

- Good, because one function serves the page, the API, and `/api/inngest`.
- Good, because migrations run in the build step, so a deploy cannot serve a
  stale schema.
- Bad, because the entry is split: only `src/main.ts` calls `listen()`.
- Bad, because `functions` config (file includes, `maxDuration`) cannot reach a
  mounted app.
- Bad, because the environment contract is duplicated per environment
  (`.env.example` documents it) and the first deploy needs a manual Inngest
  sync.

### Confirmation

This command exits non-zero unless the Bun runtime and the migration build step
are configured:

```sh
jq -e '.bunVersion == "1.x" and .buildCommand == "bun run db:migrate"' vercel.json
```
