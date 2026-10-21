# SvelteKit Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** SvelteKit becomes the process that serves the chat page and hands
every `/api/*` request to the existing Elysia app, which moves to `src/api/`.

**Architecture:** All backend code moves under `src/api/`. A pure factory
`createApi(deps)` builds the Elysia app with `prefix: "/api"`, and
`src/api/index.ts` wires it to the real dependencies. SvelteKit's catch-all
`src/routes/api/[...slugs]/+server.ts` exports
`fallback = ({ request }) => app.handle(request)`. The Lake County page becomes
`src/routes/+page.svelte` with deep-chat imported from npm.

**Tech Stack:** Bun 1.4.3, SvelteKit 3.1.x (config in `vite.config.ts`), Svelte
5.57.x, Vite 8.x, `@sveltejs/adapter-vercel` 7.x, Elysia 1.4.x, Inngest 4.x,
deep-chat 2.5.x, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-10-21-sveltekit-host-design.md`

## Global Constraints

- Lint locks are errors everywhere, including tests and `.svelte` script blocks:
  no `let`/`var`, no loops, no assignment to variables, parameters, or
  properties, no `any`, no `as`, no `@ts-ignore`/`@ts-expect-error`, no non-null
  `!`, no `eslint-disable`. Never add a rule to the relaxation block to get
  SvelteKit or Svelte code to pass. If a lock cannot be met in Svelte syntax,
  stop and ask.
- Concrete clients and env reads live only in `src/api/deps.ts`. The SvelteKit
  side reads no backend env.
- `src/api/` imports nothing outside `src/api/`. Outside `src/api/`, only
  `src/routes/api/[...slugs]/+server.ts` imports from it.
- Bun stays the package manager, script runner, test runner, and runtime. Run
  Vite under Bun with `bun --bun vite ...`.
- Never read `node_modules/`. Read published docs and record the version read in
  the commit message or PR description.
- No fixed dev port (ADR-0005).
- Gates: `bun run format:check`, `bun run lint`, `bun run typecheck`,
  `bun run test`, `bun run build`. They must pass on a fresh clone with only
  `bun install`. Run `bun run format` before each commit.
- Comments only for a short invariant note, a genuinely complex block, or a
  public JSDoc. Never use em dashes.
- One commit per task on branch `feat/sveltekit-host`.

## Review Focus

- An old path (`GET /contracts`, `POST /process-contracts`) is called. The user
  expects it to no longer reach the API. Pinned by Task 1 Step 1 (404 from
  Elysia) and Task 4 Step 6 (no JSON from SvelteKit).
- An unknown `/api/*` path is called. The user expects Elysia's 404, not the
  SvelteKit HTML page. Pinned by Task 1 Step 1 and Task 4 Step 6.
- A follow-up chat question. The user expects the whole conversation in the
  request body (`maxMessages: 0`) and the reply to stream in pieces, not arrive
  all at once through the SvelteKit wrapper. Pinned by Task 2 Step 10 and Task 4
  Step 6.
- The Inngest dev server calls back at `host.containers.internal:<port>`. Vite's
  host check rejects unknown `Host` headers, so the sync would fail. Pinned by
  Task 4 Step 5.
- A commit or fresh clone with no `DATABASE_URL`. The user expects the build to
  pass on stubs, and real values to win when set. Pinned by Task 2 Step 9.

---

### Task 1: Move the backend into `src/api/` behind `/api`

The app still starts the old way at the end of this task. Only the code location
and the API paths change.

**Files:**

- Move (`git mv`): `src/box/`, `src/chat/`, `src/config/`, `src/db/`,
  `src/functions/`, `src/openrouter/`, `src/smart-features/`, `src/deps.ts`,
  `src/inngest.ts` into `src/api/` (same names). Move `src/routes/chat.ts` and
  `src/routes/contracts.ts` to `src/api/routes/`.
- Create: `src/api/app.ts`, `src/api/app.test.ts`
- Create: `src/api/index.ts` (replaces `src/index.ts`)
- Delete: `src/index.ts`
- Modify: `src/main.ts`, `src/api/routes/chat.ts`,
  `src/api/routes/contracts.ts`, `drizzle.config.ts`
  (`schema: "./src/api/db/schema.ts"`), `package.json` (`build` entry becomes
  `src/main.ts`), `CHANGELOG.md`

**Interfaces:**

- Produces:
  - `createApi(deps: { inngest: InngestEventSender; inngestHandler: (request: Request) => Promise<Response>; store: DocumentStore; agent: ChatAgent })`
    in `src/api/app.ts`. Returns `new Elysia({ prefix: "/api" })` with
    `.use(createContractsRoutes(...))`, `.use(createChatRoutes(...))`, and
    `.all("/inngest", ({ request }) => deps.inngestHandler(request))`.
  - `src/api/index.ts` default export: the Elysia app from `createApi`, wired
    with `inngest`, `documentStore`, `chatAgent`, and
    `serve({ client: inngest, functions: [listFilesFn, processFileFn] })` from
    `inngest/bun` (kept: it is already a fetch-style handler on Bun, which
    satisfies the spec).
  - Route paths inside Elysia: `POST /process-contracts`, `GET /contracts`,
    `POST /chat`, `ALL /inngest`. The prefix makes them `/api/...`.

- [ ] **Step 1: Write the failing test `src/api/app.test.ts`**

Build the app with fakes: a store whose `listAll` resolves
`[{ document_id: "d1" }]` (shape it to `StoredDocumentSummary`), a sender that
records events, an `inngestHandler` that returns `new Response("inngest")`, and
an agent that yields `"Hel"`, `"lo"`. Call
`app.handle(new Request("http://localhost/..."))`.

```ts
it("serves contracts under /api", ...)          // GET /api/contracts -> 200, JSON equals the fake rows
it("no longer serves /contracts", ...)          // GET /contracts -> 404
it("queues a run under /api", ...)              // POST /api/process-contracts {"maxDocuments":10} -> 201; sender saw { name: "box/list.files", data: { maxDocuments: 10 } }
it("no longer serves /process-contracts", ...)  // POST /process-contracts -> 404
it("rejects an out-of-range maxDocuments", ...) // POST /api/process-contracts {"maxDocuments":0} -> 422; sender saw nothing
it("delegates /api/inngest", ...)               // GET and PUT /api/inngest -> body "inngest"
it("streams chat under /api", ...)              // POST /api/chat {"messages":[{"role":"user","text":"hi"}]} -> content-type text/event-stream; body equals 'data: {"text":"Hel"}\n\ndata: {"text":"lo"}\n\n'
it("404s unknown /api paths", ...)              // GET /api/nope -> 404
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/api/app.test.ts` Expected: FAIL, `createApi` not found.

- [ ] **Step 3: Move the modules and implement `createApi`**

`git mv` the files listed above. Fix relative imports (`../deps` and similar
stay valid inside `src/api/`). In the route modules, drop `/api` from
`/api/chat`. Write `src/api/app.ts` and `src/api/index.ts` per Interfaces.
Rewrite `src/main.ts` to compose
`new Elysia().use(staticPlugin({ assets: "public", prefix: "", indexHTML: true })).use(api)`,
keep the `deepChat.bundle.js` route and `listen(0)` log line. It is deleted in
Task 2.

- [ ] **Step 4: Run all tests**

Run: `bun test` Expected: PASS, including the 8 moved suites.

- [ ] **Step 5: Update `CHANGELOG.md`**

Under `### Changed`: "`/contracts` and `/process-contracts` moved to
`/api/contracts` and `/api/process-contracts`; every API now lives under
`/api`."

- [ ] **Step 6: Gates and commit**

Run all five gates. Expected: all pass.

```bash
git add -A src drizzle.config.ts package.json CHANGELOG.md
git commit -m "refactor: move the backend into src/api behind an /api prefix"
```

---

### Task 2: SvelteKit hosts the page and the API

**Files:**

- Create: `vite.config.ts`, `src/app.html`, `src/app.d.ts`,
  `src/routes/+page.svelte`, `src/routes/+page.ts`, `src/lib/lake-county.css`
  (moved from `public/`), `src/routes/api/[...slugs]/+server.ts`,
  `docs/decisions/0011-sveltekit-hosts-elysia.md`
- Delete: `public/` (all of it), `src/main.ts`
- Modify: `package.json`, `tsconfig.json`, `.prettierrc.json`,
  `.prettierignore`, `.gitignore`, `eslint.config.ts` (ignores only),
  `vercel.json`, `README.md` (Install, Development, Deployment, Architecture
  Decisions), `AGENTS.md` (Project paragraph and Repository layout),
  `CHANGELOG.md`

**Interfaces:**

- Consumes: `src/api/index.ts` default export (Task 1).
- Produces: `bun run dev` = `bun --bun vite dev`; `bun run build` =
  `bun --bun vite build` with env stubs (Step 7); SvelteKit serves `/` and
  `/api/*`.

- [ ] **Step 1: Add dependencies**

`bun add -d @sveltejs/kit @sveltejs/adapter-vercel svelte vite svelte-check prettier-plugin-svelte`.
`bun remove @elysiajs/static`. Read the SvelteKit 3 "Creating a project" and
"Project structure" docs for anything else the installed major requires (for
example `@sveltejs/vite-plugin-svelte`).

- [ ] **Step 2: Write `vite.config.ts`**

`sveltekit({ adapter: adapter({ runtime: "experimental_bun1.x" }) })` from
`@sveltejs/kit/vite` and `@sveltejs/adapter-vercel`. Confirm the runtime option
name in the adapter 7.x docs (it was `experimental_bun1.x` in 6.1.1 per
sveltejs/kit#14879). If 7.x has no Bun runtime, stop and report. Add
`server.allowedHosts: ["host.containers.internal"]` (Task 4 needs it).

- [ ] **Step 3: Wire TypeScript and scripts**

`tsconfig.json` extends `./.svelte-kit/tsconfig.json`, keeps the current strict
flags and `types: ["bun"]`, and still covers `drizzle.config.ts` and
`vite.config.ts` (use `kit.typescript.config` or `include`, per the docs).
Scripts: `"prepare": "svelte-kit sync && husky"`,
`"typecheck": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --fail-on-warnings"`,
`"dev": "bun --bun vite dev"`. Add `.svelte-kit/` to `.gitignore`,
`.prettierignore`, and the ESLint ignores. Add `prettier-plugin-svelte` to
`.prettierrc.json`. Remove `public/deepChat.bundle.js` entries from all three
ignore lists.

- [ ] **Step 4: Write the API wrapper `src/routes/api/[...slugs]/+server.ts`**

```ts
import app from "../../../api";
import type { RequestHandler } from "./$types";

export const fallback: RequestHandler = ({ request }) => app.handle(request);
```

- [ ] **Step 5: Port the page**

`src/app.html`: SvelteKit's shell with `lang="en"`, the viewport meta, and the
title `Contract Investigation | Lake County, Illinois`. `src/routes/+page.ts`:
`export const ssr = false;` (deep-chat is browser-only).
`src/routes/+page.svelte`: imports `deep-chat` and `$lib/lake-county.css` at the
top of the script. The markup is `public/index.html`'s `<body>` copied verbatim,
including the five style attributes. The three inline-script settings become
props on the element: `connect={{ url: "/api/chat", stream: true }}`,
`requestBodyLimits={{ maxMessages: 0 }}`,
`introMessage={{ text: "Ask me anything. I am the Contract Investigation assistant." }}`.
Keep the existing one-line reason for `maxMessages: 0` as a short comment.
`src/app.d.ts` declares the `deep-chat` element for `svelte/elements` if
svelte-check reports it unknown. Follow deep-chat's Svelte docs.

- [ ] **Step 6: Delete the old host**

`git rm -r public src/main.ts`.

- [ ] **Step 7: Build with env stubs**

```json
"build": "BOX_APP_TOKEN=${BOX_APP_TOKEN:-build-stub} BOX_FOLDER_ID=${BOX_FOLDER_ID:-build-stub} DATABASE_URL=${DATABASE_URL:-postgres://stub:stub@localhost:5432/stub} OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-build-stub} SMART_FEATURE_MODEL=${SMART_FEATURE_MODEL:-build-stub} CHAT_MODEL=${CHAT_MODEL:-build-stub} bun --bun vite build"
```

First run `env -u DATABASE_URL bun --bun vite build` without stubs. If it
passes, SvelteKit's build does not import the route: use plain
`bun --bun vite build` and skip the stubs (spec). If it fails with
`DATABASE_URL is required`, keep the stubs.

- [ ] **Step 8: Vercel and docs**

`vercel.json`: keep `$schema`, `bunVersion: "1.x"`, and `buildCommand`. Remove
`functions`. README Deployment: replace the bundled-function paragraph with the
adapter setup. Drop `VERCEL_EXPERIMENTAL_BACKENDS=1` unless the Vercel SvelteKit
docs still call for it. Write ADR-0011 in the lean MADR style of ADR-0002.
Title: "SvelteKit hosts the app, Elysia serves /api". Options: SvelteKit host
with Elysia mounted at `/api`, or a Svelte SPA served by Elysia. Confirmation:
"`GET /` and `GET /api/contracts` respond from one `mise run dev`." Status
`accepted`. Add it to README's Architecture Decisions list. Update AGENTS.md:
the Project paragraph's endpoints and the Repository layout section, describing
`src/api/` (backend, isolated, exports the Elysia app) and `src/routes/`
(SvelteKit page plus the `/api` wrapper). CHANGELOG `Changed`: "The Contract
Investigation page is served by SvelteKit." Replace the "Vercel deployment: one
Vercel Function on the Bun runtime" bullet with "Vercel deployment through the
SvelteKit Vercel adapter on the Bun runtime".

- [ ] **Step 9: Verify the build env behavior**

Run: `env -u DATABASE_URL bun run build` Expected: succeeds, `.vercel/output/`
exists. Every stub uses the `${VAR:-stub}` form, which keeps a value that is
already set, so Vercel's real env wins.

- [ ] **Step 10: Verify the page locally**

Run: `mise run dev:setup`, then `bun run dev` with `DATABASE_URL` exported as in
`mise.toml`. Open `/` in a browser. Expected: the page matches the old one
(masthead, hero, about, bottom-right assistant with the intro message). Send two
questions. In devtools, the second `POST /api/chat` body holds all prior
messages, and the reply renders incrementally.

- [ ] **Step 11: Gates and commit**

Run all five gates. Expected: all pass. Commit with the doc versions read in the
body.

```bash
git add -A
git commit -m "feat: host the chat page and the /api routes in SvelteKit"
```

---

### Task 3: Lint Svelte files and enforce the backend boundary

**Files:**

- Modify: `package.json` (via `bun add -d`), `eslint.config.ts`

**Interfaces:**

- Consumes: the file layout from Tasks 1 and 2.

- [ ] **Step 1: Write the failing check**

Temporarily add `import "../../routes/+page.ts";` to `src/api/routes/chat.ts`
and `import "../api/deps";` to `src/routes/+page.ts`. Run: `bun run lint`
Expected: PASS. That is the failure: no boundary rule yet.

- [ ] **Step 2: Add the rules**

`bun add -d eslint-plugin-svelte eslint-plugin-import-x eslint-import-resolver-typescript`.
Add `svelte.configs.recommended` and a `**/*.svelte` block that uses the
typescript-eslint parser with `projectService` and
`extraFileExtensions: [".svelte"]`, so the HARD LOCKS block applies to Svelte
script blocks. Add `import-x/no-restricted-paths` zones so that files in
`src/api/` cannot import anything in `src/` outside `src/api/`, and files in
`src/` outside `src/api/` cannot import `src/api/`, except
`src/routes/api/[...slugs]/+server.ts`. Imports within `src/api/` stay legal.
Use globs or `except` as the plugin docs allow.

- [ ] **Step 3: Run lint against the deliberate violations**

Run: `bun run lint` Expected: FAIL with two `import-x/no-restricted-paths`
errors, one per bad import, and none for `src/routes/api/[...slugs]/+server.ts`.

- [ ] **Step 4: Remove the violations and rerun**

Revert both temporary imports. Run all five gates. Expected: all pass. If a lock
fires on Svelte syntax that has no lock-compliant form, stop and ask.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock eslint.config.ts
git commit -m "chore: lint Svelte files and keep src/api isolated"
```

---

### Task 4: Local dev loop through SvelteKit

**Files:**

- Modify: `mise.toml` (`dev` task), `README.md` (Usage)

**Interfaces:**

- Consumes: `bun run dev` (Task 2), `server.allowedHosts` (Task 2 Step 2).

- [ ] **Step 1: Pin the startup line**

Run: `NO_COLOR=1 bun run dev -- --host --clearScreen false` and record Vite's
`Local:` line. `--host` binds all interfaces the way `listen(0)` did, so the
Inngest container can reach it.

- [ ] **Step 2: Rewrite the `dev` task**

Same shape as today. Run `NO_COLOR=1 bun run dev -- --host --clearScreen false`,
wait for the `Local:` line instead of `Elysia listening`, and parse the port
with `sed -n 's#.*Local:.*:\([0-9]*\)/.*#\1#p'`. Send the existing `PUT` to
`/api/inngest`. Vite falls back to the next free port when its default is taken,
so no port is fixed.

- [ ] **Step 3: Update README Usage**

`mise run dev` description, the greped `Local:` line instead of
`Elysia listening`, and every curl path under `/api` (`/api/process-contracts`,
`/api/contracts`).

- [ ] **Step 4: Start it**

Run: `mise run dev` Expected: the app URL prints, and the `PUT` prints a success
body.

- [ ] **Step 5: Verify the Inngest sync**

In the Inngest UI (URL from `dev:setup`), the app shows `list-files` and
`process-file`. Expected: synced, no 403 from Vite's host check.

- [ ] **Step 6: Verify the routes**

```sh
curl -s localhost:<port>/api/contracts                # JSON array
curl -s -o /dev/null -w '%{http_code}' -X POST localhost:<port>/api/process-contracts -H 'content-type: application/json' -d '{"maxDocuments":1}'   # 201
curl -s -o /dev/null -w '%{http_code}' localhost:<port>/contracts      # 404, HTML not JSON
curl -s -o /dev/null -w '%{http_code}' localhost:<port>/api/nope       # 404
curl -sN -X POST localhost:<port>/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","text":"How many contracts are there?"}]}'   # data: frames arrive one at a time
```

- [ ] **Step 7: Second workspace**

Start `mise run dev` in a second worktree at the same time. Expected: both get
different ports and both sync (ADR-0005 Confirmation). Stop both with
`mise run dev:teardown`.

- [ ] **Step 8: Gates and commit**

```bash
git add mise.toml README.md
git commit -m "chore: run the dev loop through the SvelteKit dev server"
```

---

## PR

Push `feat/sveltekit-host` and open a PR against `main`. Note that the branch
stacks on `feat/contract-query-tool`. The PR description lists the Vercel
configuration (adapter `runtime`, `vercel.json`, env the deploy needs) and the
doc pages and versions it rests on, for the user to verify on Vercel.
