# SvelteKit host design

Date: 2026-10-21

## Intent

Today one Elysia app on Bun serves everything: the static chat page from
`public/`, the JSON API, and the Inngest handler. The UI should move into
Svelte, and the APIs should stay in Elysia. SvelteKit becomes the process that
starts and listens. It renders the page and passes every `/api/*` request to the
Elysia app, which is the approach in the Elysia SvelteKit integration docs
(<https://elysiajs.com/integrations/sveltekit>).

Backend and frontend code are fully isolated. Someone should be able to move the
Elysia app into its own repo and host it with a three-line wrapper around the
imported app. That move is out of scope here. It only sets how the code is
organized.

## Goals

- SvelteKit is the top-level process, locally and on Vercel.
- Every API lives in Elysia, behind `/api`. Nothing outside `/api` is an API.
- The chat page moves into SvelteKit unchanged in look and behavior.
- All backend code lives under `src/api/`, isolated from the frontend.
- `mise run dev` works locally, including the Inngest sync.
- Vercel deploys, as far as the documentation can confirm. The user checks the
  deployment on the PR.

## Non-goals

- Any UI change: no redesign, no new pages, no new features.
- Moving off Bun. Bun stays the package manager, test runner, script runner, and
  runtime.
- Splitting the API into its own repo or package.
- Typed client calls from Svelte to Elysia (Eden). The page calls the API over
  HTTP only.

## Anti-goals

- Frontend code that imports backend code, or the reverse, except the one
  wrapper file.
- Any API route reachable outside `/api`.
- A fixed dev port. ADR-0005 still holds.

## Current state

- `src/index.ts` builds the Elysia app: the static plugin serving `public/`
  (including `index.html` at `/`), `src/routes/contracts.ts`,
  `src/routes/chat.ts`, and `/api/inngest` via `inngest/bun`'s `serve`.
- `src/main.ts` adds a `Bun.file` route for `deepChat.bundle.js` and calls
  `app.listen(0)`, then logs `Elysia listening on http://...:<port>`.
- Routes and their paths today:
  - `POST /process-contracts` (`src/routes/contracts.ts`)
  - `GET /contracts` (`src/routes/contracts.ts`)
  - `POST /api/chat` (`src/routes/chat.ts`)
  - `ALL /api/inngest` (`src/index.ts`)
- `public/index.html` is the Lake County page with a `<deep-chat>` element,
  configured by an inline script:
  `connect = { url: "/api/chat", stream: true }`,
  `requestBodyLimits = { maxMessages: 0 }`, and an intro message.
  `public/lake-county.css` styles it.
- `package.json` `build` bundles `src/index.ts` with `bun build` and copies the
  deep-chat bundle into `public/`.
- `vercel.json` sets `bunVersion: "1.x"`, the build command
  `bun run build && bun run db:migrate`, and
  `functions.index.includeFiles: "public/**"`. The README tells deployers to set
  `VERCEL_EXPERIMENTAL_BACKENDS=1`.
- `mise run dev` runs `bun run dev` (`bun --hot src/main.ts`), greps the log for
  `Elysia listening`, and sends the Inngest sync `PUT` to
  `http://host.containers.internal:<port>/api/inngest`.
- `compose.yaml` starts the Inngest dev server with
  `-u http://host.containers.internal:3000/api/inngest --no-discovery`.

## Decisions (the user's)

- SvelteKit hosts the app. Elysia is mounted at
  `src/routes/api/[...slugs]/+server.ts` with
  `export const fallback = ({ request }) => app.handle(request)`, and the Elysia
  app is built with `new Elysia({ prefix: "/api" })`.
- This gets a new ADR, `docs/decisions/0011-sveltekit-hosts-elysia.md` (0011 is
  the next free number; 0008 was skipped and stays skipped). ADR-0002 (Elysia on
  Bun) still stands and is not superseded: the API framework and runtime are
  unchanged.
- Bun stays everywhere. No runtime ADR.
- Backend code lives in `src/api/`. That covers every current backend module:
  `box/`, `chat/`, `config/`, `db/`, `functions/`, `openrouter/`,
  `smart-features/`, the Elysia route modules, `inngest.ts`, and the `deps.ts`
  composition root. `src/api/` exports the finished Elysia app.
- The SvelteKit wrapper file is the only frontend file that imports from
  `src/api/`, and it stays about three lines.
- The UI is a straight port of `public/index.html`.
- Vercel should work. Configure it from the SvelteKit, adapter, and Vercel
  documentation. Verify locally. The user verifies Vercel after the PR is
  opened.
- **Build-time env stubs.** SvelteKit's build may import the `/api` route, which
  runs `loadEnv()` in `src/api/deps.ts` and throws on any missing variable.
  Locally `.env` deliberately lacks `DATABASE_URL` (mise injects it), and the
  pre-commit hook runs `bun run build` outside mise, so the build would fail.
  Fix: the `build` script supplies stub values for the variables `loadEnv()`
  requires, and only when the variable is unset, so real values (Vercel's build
  env, a mise-injected env) always win. Stubs live in the build command only.
  They never reach runtime, and app code does not change to accommodate them.
  First confirm whether the build actually imports the route. If it does not,
  skip the stubs.

## Decisions (my calls, open to override)

- **API paths.** All four routes move under `/api`:
  `POST /api/process-contracts`, `GET /api/contracts`, `POST /api/chat`, and
  `ALL /api/inngest`. Inside Elysia the paths drop their `/api` because the
  prefix supplies it. This is a breaking change to two public paths.
- **Isolation is enforced by lint.** An ESLint import restriction stops files in
  `src/api/` from importing anything outside `src/api/`, and stops files outside
  it from importing `src/api/` except `src/routes/api/[...slugs]/+server.ts`.
- **deep-chat** is imported from the npm package inside the Svelte page, not
  served as a copied bundle. `public/deepChat.bundle.js`, the `cp` in `build`,
  the `Bun.file` route, and the matching `.gitignore` and ESLint ignore entries
  all go away. deep-chat is a browser-only web component, so it must load on the
  client only (for example a dynamic import in `onMount`, or `ssr = false` for
  the page). The builder picks the mechanism.
- **Styles.** `lake-county.css` moves to the frontend and is imported by the
  page or root layout. `public/` is deleted.
- **Inngest serve adapter.** Switch from `inngest/bun` to whichever Inngest
  entry point fits a fetch-style `Request -> Response` handler inside Elysia
  (check the Inngest docs for the installed version). The function definitions
  do not change.
- **Static files.** If anything still needs serving as a file, it goes in
  SvelteKit's `static/` directory. The Elysia static plugin dependency is
  removed.
- **Tooling for `.svelte` files.** Prettier, ESLint, and typecheck cover Svelte
  files: `prettier-plugin-svelte`, `eslint-plugin-svelte`, and `svelte-check` as
  part of `bun run typecheck`. The existing lint locks apply to the script
  blocks of `.svelte` files too. If a lock cannot apply to Svelte syntax (for
  example Svelte 5 `$state` needing `let`), stop and ask the user. Do not relax
  it.
- **Tests** move with their modules into `src/api/` and keep running under
  `bun test`. No new frontend tests: the page has no logic of its own beyond
  deep-chat configuration.
- **`drizzle.config.ts`** points at the moved schema path. Migrations in
  `drizzle/` do not change.

## Constraints

- Lint locks (`AGENTS.md`, `eslint.config.ts`) hold everywhere, including tests
  and Svelte script blocks. Do not add rules to the relaxation block to make
  SvelteKit code pass.
- Dependency injection: concrete clients are still built only in the composition
  root, now `src/api/deps.ts`. The SvelteKit side reads no backend env.
- Do not read `node_modules/`. Read the published documentation for SvelteKit,
  `@sveltejs/adapter-vercel`, Vite, Elysia, Inngest, and deep-chat, and record
  the version read.
- SvelteKit 3 moved config into `vite.config.ts` through the `sveltekit()`
  plugin. `svelte.config.js` is not supported there. Check the installed major
  and follow its docs.
- The `bun run` gates (format, lint, typecheck, build, test) must pass on a
  fresh clone with only `bun install`.
- ADR-0005: no fixed port. The dev server's port comes from the runtime, and the
  `dev` mise task reads it from startup output and sends the Inngest sync `PUT`
  to `/api/inngest` as it does now. The Vite dev server should run on Bun
  (`bun --bun vite dev`). The builder decides how to get a free port (Vite's own
  fallback, an explicit port the task picks, or `--port 0` if supported). The
  README must describe the line the task greps.
- `compose.yaml`'s hard-coded `:3000` in the Inngest `-u` flag is unused under
  `--no-discovery`. Leave it unless it gets in the way.

## Vercel

- Use `@sveltejs/adapter-vercel`. sveltejs/kit#14879 states the adapter can
  target Vercel's Bun runtime through adapter config. Confirm that in the
  adapter docs and configure it. If the docs do not support it, stop and report
  instead of switching runtimes.
- `vercel.json` keeps only what is still needed. The `functions.index` entry and
  `includeFiles` go. Migrations still run at build time: keep
  `bun run db:migrate` in the build command.
- The README's `VERCEL_EXPERIMENTAL_BACKENDS=1` instruction is removed if the
  SvelteKit build no longer needs it, per the Vercel docs.
- The PR description lists exactly what was configured for Vercel and which doc
  pages and versions it rests on, so the user can check the deploy.

## Documentation

- ADR-0011 in the lean house style: SvelteKit hosts the app, Elysia is mounted
  under `/api`. Confirmation: `GET /api/contracts` and `GET /` respond from one
  `mise run dev`.
- `README.md`: Usage (new paths, new startup line, dev commands), Development
  (gates), Deployment (Vercel setup), Architecture Decisions list.
- `CHANGELOG.md` `[Unreleased]` under `Changed`: the page is served by
  SvelteKit, and `/contracts` and `/process-contracts` moved to `/api/contracts`
  and `/api/process-contracts`.
- `AGENTS.md` "Repository layout" section updated to the new tree. (Process doc,
  not a changelog entry.)

## Verification (local)

- `bun run format:check`, `lint`, `typecheck`, `build`, and `test` all pass.
- `mise run dev` starts, prints the app URL, and the Inngest sync `PUT` returns
  `200`.
- `GET /` returns the page. In a browser the chat streams a reply from
  `/api/chat`.
- `GET /api/contracts` returns JSON. `POST /api/process-contracts` returns
  `201`.
- `GET /contracts` and `POST /process-contracts` no longer hit the API.
- A lint run fails on a deliberate cross-boundary import (checked once, not
  committed).

## Left to the builder

- The exact SvelteKit file layout outside `src/api/` and `src/routes/`.
- How the deep-chat element is configured from Svelte (attributes or properties
  set after mount), as long as behavior matches today's inline script.
- `tsconfig.json` shape (SvelteKit generates one to extend).
- How the free dev port is obtained, within ADR-0005.
