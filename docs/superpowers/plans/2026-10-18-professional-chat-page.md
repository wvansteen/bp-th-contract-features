# Professional Chat Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare `/` response and full-page `/chat` with one Lake
County, Illinois branded `Contract Investigation` page carrying the chat as a
fixed assistant panel bottom right.

**Architecture:** One static HTML page plus one stylesheet served by the
existing Elysia static setup; `src/index.ts` serves the page on `/` and
redirects `/chat` to `/`. A new Elysia app factory is extracted so routes can be
tested without listening on a socket.

**Tech Stack:** Elysia on Bun, deep-chat 2.5.1 web component, `bun:test`, static
HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-10-18-professional-chat-page-design.md`

## Global Constraints

- No new dependencies. No frontend build step (ADR-0005).
- Repo style locks hold everywhere, including the page script: no `let`/`var`,
  no loops, no `any`, no eslint disable comments.
- Chat keeps `directConnection` to Ollama `llama3.2` with `stream: true` and
  `maxMessages: -1`, unchanged.
- Brand tokens: navy `#00568C`, action blue `#0073BB`, Figtree with system-sans
  fallback, sourced from lakecountyil.gov.
- Panel: `position: fixed`, bottom right, width
  `min(380px, calc(100vw - 2rem))`; below 640px it spans the bottom as a sheet.
- No document list, table, search, or launcher open/close on the page.

## Review Focus

- Deep-chat's `<deep-chat>` must still stream from Ollama after the move:
  covered by Task 2's markup assertion plus manual confirmation in the task's
  verification step.
- `/chat` must redirect rather than 404, or existing links and docs break:
  covered by Task 1's `GET /chat` test.
- The `location` header must be an absolute URI (`http://localhost/`), since a
  bare `/` in a `Location` header is not spec-valid: covered by Task 1's
  assertion on the header value.
- The page must not depend on a hotlinked image or font CDN: covered by Task 2's
  assertion that `public/index.html` references no `http(s)` asset.
- The inline page script must satisfy the repo style locks even though ESLint
  does not lint HTML: covered by Task 2's check that the script contains no
  `let `, `var `, or `for`/`while`/`do` keyword, plus the repo `lint` run over
  the rest.

---

### Task 1: Serve the page at `/` and redirect `/chat`

**Files:**

- Create: `src/app.ts`
- Create: `src/app.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `helloWorld` from `src/functions/hello`, `inngest` from
  `src/inngest` (existing exports, unchanged).
- Produces: `createApp(deps: { inngest: InngestEventHandler }): Elysia` in
  `src/app.ts`, where `InngestEventHandler` is
  `(request: Request) => Promise<Response>`; `createServerApp(): Elysia` in
  `src/index.ts` wiring the real `serve` handler. Task 2 relies on `createApp`
  serving `GET /` from `public/index.html` and `GET /chat` as a 302.

- [ ] **Step 1: Write the failing tests**

`src/app.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { createApp } from "./app";

const handler = () => Promise.resolve(new Response(null, { status: 200 }));

describe("createApp", () => {
  test("GET / serves the Contract Investigation page", async () => {
    const app = createApp({ inngestHandler: handler });
    const response = await app.handle(new Request("http://localhost/"));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("<deep-chat");
    expect(body).toContain("Contract Investigation");
  });

  test("GET /chat redirects to /", async () => {
    const app = createApp({ inngestHandler: handler });
    const response = await app.handle(new Request("http://localhost/chat"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/app.test.ts` Expected: FAIL with "Cannot find module './app'"
(the module does not exist yet).

- [ ] **Step 3: Implement `createApp` in `src/app.ts`**

Extract the app construction from `src/index.ts` unchanged, with the Inngest
handler passed in as a dependency:

```ts
export type InngestEventHandler = (request: Request) => Promise<Response>;

export function createApp(deps: {
  inngestHandler: InngestEventHandler;
}): Elysia;
```

The body is the existing chain: `GET /` returns `Bun.file("public/index.html")`,
`ALL /api/inngest` delegates to `deps.inngestHandler`, `GET /chat` returns
`status(302, { headers: { location: "/" } })` (Elysia resolves this to an
absolute `Location`), and the `/deep-chat` static plugin stays as it is. The
`.listen(0)` call does not move into `createApp`; it stays in `src/index.ts`,
which now builds the handler with `serve`, calls
`createApp({ inngestHandler: (request) => handler(request) })`, and logs the URL
as before.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/app.test.ts` Expected: PASS (2 tests). Then
`bun run typecheck` and `bun run lint` both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/app.test.ts src/index.ts
git commit -m "feat: serve the app as a testable factory with /chat redirecting to /"
```

---

### Task 2: Lake County branded page with embedded assistant panel

**Files:**

- Modify: `public/index.html`
- Create: `public/lake-county.css`
- Modify: `src/app.test.ts`

**Interfaces:**

- Consumes: `createApp` from Task 1.
- Produces: the page at `/`; `public/lake-county.css` is linked from
  `public/index.html` and is the only stylesheet.

- [ ] **Step 1: Write the failing tests**

Add to `src/app.test.ts` in the existing `describe` block. Read the page with
`Bun.file("public/index.html").text()` for the file-level checks; use
`createApp` only for the route-level check:

```ts
test("the page loads one local stylesheet and no remote assets", async () => {
  const body = await Bun.file("public/index.html").text();
  expect(body).toContain('href="lake-county.css"');
  expect(body).not.toMatch(/src="https?:/);
  expect(body).not.toMatch(/href="https?:/);
});

test("the page carries the Lake County brand and the chat element", async () => {
  const body = await Bun.file("public/index.html").text();
  expect(body).toContain("Lake County, Illinois");
  expect(body).toContain("Contract Investigation");
  expect(body).toContain("<deep-chat");
});

test("the page script obeys the repo style locks", async () => {
  const body = await Bun.file("public/index.html").text();
  expect(body).not.toMatch(
    /<script[^>]*>[\s\S]*?\b(let |var |for\(|while\(|do\()/,
  );
});

test("GET / serves the page", async () => {
  const app = createApp({ inngestHandler: handler });
  const response = await app.handle(new Request("http://localhost/"));
  const body = await response.text();
  expect(response.status).toBe(200);
  expect(body).toContain("Contract Investigation");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/app.test.ts` Expected: FAIL on the first three tests (the
page is still the bare chat page: no `lake-county.css`, no "Lake County,
Illinois", and the old script). The `GET /` test may already pass; that is
expected.

- [ ] **Step 3: Rewrite `public/index.html` and add `public/lake-county.css`**

The page, in one screen of structure: `<header>` masthead with the text wordmark
"Lake County, Illinois" and the page name "Contract Investigation" (navy
`#00568C`, white text, Figtree); a `<main>` hero with the page title and one
line of purpose, plus one short section describing what the tool does (no lists
of documents, no tables); a fixed `<aside>` assistant panel bottom right with a
navy title bar ("Contract Assistant"), the `<deep-chat>` element filling the
rest, wired with the existing `directConnection` Ollama config moved verbatim,
including the explanatory comments. `public/lake-county.css` holds all styling:
brand tokens as CSS custom properties, the fixed panel at
`min(380px, calc(100vw - 2rem))` with the 640px bottom-sheet fallback, right
padding on `main` at wide viewports, and deep-chat theme overrides via the
component's own custom properties (message colors, input area, submit button)
scoped to the panel.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/app.test.ts` Expected: PASS (6 tests: 2 from Task 1, 4 here).
Then `bun run format:check`, `bun run lint`, `bun run typecheck`, and
`bun run build` all exit 0. Manual check: `bun run dev`, open the printed URL,
and confirm the page renders with the panel bottom right and a message streams
back from Ollama.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/lake-county.css src/app.test.ts
git commit -m "feat: Lake County branded Contract Investigation page with embedded chat"
```

---

### Task 3: Documentation and ADR

**Files:**

- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/decisions/0008-branded-page-at-root.md`

**Interfaces:**

- Consumes: the behavior shipped in Tasks 1 and 2.
- Produces: nothing code-relevant.

- [ ] **Step 1: Write the ADR**

Copy `docs/decisions/adr-template.md` to
`docs/decisions/0008-branded-page-at-root.md`, status `accepted`, date
`2026-10-18`. Context: the root route returned JSON and the chat lived at
`/chat` as a bare full-page component; the tool now needs one professional
`Contract Investigation` face. Decision: the branded static page is served at
`/` and `/chat` redirects to it, because one entry point is all a single-page
tool needs. Consequences: good, one URL and one page to keep on-brand; bad, the
old direct chat URL is no longer a page. Confirmation:
`curl -s -o /dev/null -w "%{http_code}" localhost:<port>/chat` prints `302`.

- [ ] **Step 2: Update README and CHANGELOG**

README: replace the `GET /` and `GET /chat` bullets under Usage with one bullet
(`GET /` serves the Lake County branded Contract Investigation page with the
chat embedded as a bottom-right assistant; `/chat` redirects to `/`), and adjust
the sentence about where the chat's Ollama settings live if it names
`public/index.html`. CHANGELOG: change the `[Unreleased]` bullet for the chat
page to match the new behavior, keeping it user-facing and short.

- [ ] **Step 3: Verify docs**

Check: every README link resolves, README headings match its Table of Contents,
the changelog bullet exists under `[Unreleased]`, and the ADR's confirmation
command matches what Task 1 and 2 ship. Then run `bun run format:check` so the
markdown stays Prettier-clean.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md docs/decisions/0008-branded-page-at-root.md
git commit -m "docs: record the branded root page decision and update usage docs"
```
