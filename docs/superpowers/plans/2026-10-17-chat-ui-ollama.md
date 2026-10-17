# Chat UI backed by Ollama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a full-page chat UI at `/chat` that streams replies from a locally-running Ollama model, with no backend route of its own.

**Architecture:** `deep-chat` is a self-contained web component with a built-in Ollama client, so the browser talks to Ollama directly over `directConnection` — there is no `/talk` route, no NDJSON parser, and no SSE re-framing in this repo. Elysia's only new job is serving the HTML page and the component bundle. Adding a server-side endpoint later is a separate change.

**Tech Stack:** Bun 1.2.23, TypeScript, Elysia 1.4.30, `@elysiajs/static`, `deep-chat` 2.5.1 (web component, no build step), Ollama (local, no key).

**Spec:** Conversational agreement with the human partner, recorded in this plan. No separate design doc — the decisions are captured in ADR-0005 (Task 1) and in the Global Constraints below.

## Global Constraints

- **Never invent URLs.** Only `origin` (`git@github.com:wvansteen/bp-th-contract-features.git`) is known. No changelog compare links, no issue links.
- **Do not add a `/talk` route, a backend LLM proxy, or any server-side prompt handling.** The component calls Ollama from the browser. If a proxy is ever needed — to hold a hosted API key, or to run this through Inngest/LangChain per `AGENTS.md` — that is a new feature with its own ADR, not part of this one.
- **Do not add a frontend build step, bundler config, or framework.** The component bundle is served as-is.
- **Keep `GET /` returning `{ ok: true }`.** ADR-0002's confirmation check depends on it. The chat page lives at `/chat`.
- **Serving the component bundle means serving one file out of `node_modules`** — `node_modules/deep-chat/dist/deepChat.bundle.js` — by pointing `@elysiajs/static` at `node_modules/deep-chat/dist` under the `/deep-chat` prefix. This is not a build step and not a copy: there is no `dist/`, no bundler, and nothing compiled. `deep-chat` ships a pre-built browser bundle, and `staticPlugin` just serves files off disk. The alternative (copying it into `public/`) would duplicate a vendor artifact into the repo and need re-copying on every version bump, so serving it in place is both smaller and less to maintain.
- **`/chat` is served by a `GET /chat` route returning `Bun.file("public/index.html")`.** `public/` is *not* mounted as a static root; `staticPlugin` serves only the component bundle.
- **Ollama must allow the browser's origin.** The page is served from `http://localhost:3000` and the component posts to `http://localhost:11434`, which is cross-origin, so Ollama's CORS has to permit it. Verified against the running Ollama 0.12.9 on this machine: the preflight returns `Access-Control-Allow-Origin: http://localhost:3000`. If a developer hits a CORS error, the fix is `OLLAMA_ORIGINS` on the Ollama side, not a proxy here.
- **Logging as a side effect is allowed**; keep it to `console.log` like the rest of the repo.
- **Style matches the repo:** double quotes, 2-space indent, `export const`, mostly functional, no classes.

## Review Focus

Conditions a reasonable person would hit that nothing in the happy path covers, most likely first:

1. **The browser cannot reach Ollama** (not running, or bound to a non-loopback interface, or CORS not permitted). Expect a visible error message in the chat area from the component's own error handling — this repo has no server code in the path and therefore nothing to fix server-side. Check the browser console and `curl -i -X OPTIONS http://localhost:11434/api/chat -H 'Origin: http://localhost:3000'` first.
2. **The requested model is not pulled.** The component's Ollama client defaults to the bare tag `llama3.2`; this page pins `llama3.2:latest` instead. Expect Ollama's `model 'x' not found` text surfaced in the chat, not an empty reply.
3. **The user's machine has Ollama on a different host or port.** The component's Ollama URL is configurable; expect changing one property to be enough, and expect that property to be obvious rather than buried.
4. **A reply contains markdown, quotes, or newlines.** Expect correct rendering — Deep Chat runs message text through remarkable with `{ breaks: true, linkTarget: "_blank" }` as its own defaults. Nothing to configure; do not add a `remarkable` property.
5. **The page is served but the component never upgrades**, because the bundle failed to load. Expect `/deep-chat/deepChat.bundle.js` to be `200` with a JavaScript content type; if it `404`s the `staticPlugin` `assets` path is wrong.

Task 4 checks 1, 2, and 5 by hand against a running server and browser.

---

## File Structure

- **`src/index.ts`** — adds two routes: `GET /chat` and the `/deep-chat` static prefix. Everything else is unchanged.
- **`public/index.html`** — the chat page. Markup plus three lines of element property assignment. No framework.
- **`docs/decisions/0005-chat-ui-without-frontend-build.md`** — records the no-build-tooling choice and that the browser talks to Ollama directly.

This change adds **no new source modules and no tests**. There is no logic to test: the two routes are static file serving, and all the message handling lives in `deep-chat`. That is the point of the design, and it is why the diff should stay small — if an implementer finds themselves writing a parser or a stream transform here, the design has been departed from.

---

### Task 1: ADR for the chat page and direct Ollama connection

**Files:**
- Create: `docs/decisions/0005-chat-ui-without-frontend-build.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by code. Documents why the page is static HTML with no build step, and why the browser calls Ollama directly rather than through a server route.

No tests — an ADR is prose. Confirm by reading it back against the template.

- [ ] **Step 1: Write `docs/decisions/0005-chat-ui-without-frontend-build.md`**

Copy `docs/decisions/adr-template.md` and fill it in, keeping the house style of ADR-0002 (short, no "Pros and Cons" bloat). Frontmatter exactly, matching ADR-0002's unquoted `status`:

```yaml
---
status: accepted
date: 2026-10-17
decision-makers: William Van Steen
---
```

Title `# Chat UI served without a frontend build step`.

Context (2-3 sentences): the chat UI needs a component library; `deep-chat` is a web component that runs from one pre-built script, and the repo has no frontend build tooling, so the Svelte options would each add a toolchain to answer a problem we do not have. The component also ships a built-in Ollama client, so the first version needs no server-side LLM route.

Considered Options: exactly these four, one line each:
- SvelteKit hosting Elysia via a `+server.ts` fallback
- Vite + Svelte, served by Elysia
- Static HTML plus a server-side `/talk` proxy to Ollama
- Static HTML plus `directConnection` to Ollama from the browser

Outcome: `Chosen option: "Static HTML plus directConnection to Ollama from the browser", because the component already speaks Ollama's API, so a proxy would be code that only re-encapsulates a library.` One line why.

Consequences, terse: Good — no frontend toolchain and no proxy code; `bun run dev` stays the only command. Bad — the browser needs Ollama reachable and CORS-permitted, and a hosted model would need a proxy later; revisit when either bites.

Confirmation (one line, per the template's convention): `GET /chat` serves the chat page on `:3000` and a message in the browser streams a reply back from Ollama.

- [ ] **Step 2: Verify the ADR matches the template and the repo's other ADRs**

Run: `head -7 docs/decisions/0005-chat-ui-without-frontend-build.md`
Expected: `---`, `status: accepted`, `date: 2026-10-17`, `decision-makers: William Van Steen`, `---`, a blank line, then the `# ` title.

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0005-chat-ui-without-frontend-build.md
git commit -m "docs: ADR for the chat page and direct Ollama connection"
```

---

### Task 2: Add the static routes and serve the chat page

**Files:**
- Modify: `src/index.ts`
- Create: `public/index.html`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `GET /` → `{ok: true}` (unchanged), `GET /chat` → the chat page, `GET /deep-chat/deepChat.bundle.js` → the component bundle, `ALL /api/inngest` → unchanged. No other routes are added.

- [ ] **Step 1: Add the two dependencies**

Run: `bun add @elysiajs/static deep-chat`
Expected: both added to `package.json` dependencies, lockfile updated.

- [ ] **Step 2: Rewrite `src/index.ts`**

```ts
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import { serve } from "inngest/bun";
import { helloWorld } from "./functions/hello";
import { inngest } from "./inngest";

const handler = serve({ client: inngest, functions: [helloWorld] });

const app = new Elysia()
  .get("/", () => ({ ok: true }))
  .all("/api/inngest", ({ request }) => handler(request))
  .get("/chat", () => Bun.file("public/index.html"))
  .use(
    await staticPlugin({
      prefix: "/deep-chat",
      assets: "node_modules/deep-chat/dist",
    }),
  )
  .listen(3000);

console.log(`Elysia listening on http://${app.server?.hostname}:${app.server?.port}`);
```

Notes: the import list is alphabetical, matching the existing file's style. `staticPlugin` is `await`ed per the plugin's docs. `prefix: "/deep-chat"` serves the bundle straight out of `node_modules/deep-chat/dist` — nothing is copied or built. `Bun.file` returns `200` with `content-type: text/html;charset=utf-8`.

- [ ] **Step 3: Create `public/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Contract Features Chat</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
      }
      deep-chat {
        display: block;
        height: 100%;
      }
    </style>
    <script type="module" src="/deep-chat/deepChat.bundle.js"></script>
  </head>
  <body>
    <deep-chat id="chat"></deep-chat>
    <script type="module">
      const chat = document.getElementById("chat");
      chat.directConnection = {
        ollama: {
          // The browser posts to Ollama directly; no proxy is involved.
          url: "http://localhost:11434/api/chat",
          model: "llama3.2:latest",
          // Keep the whole conversation in the request body.
          maxMessages: -1,
        },
      };
      chat.introMessage = { text: "Ask me anything. I am running locally on Ollama." };
    </script>
  </body>
</html>
```

Notes that matter:

- The `height: 100%` rules are what make it a *full-page* chat; without them Deep Chat collapses to a short box.
- `maxMessages: -1` sends the whole transcript, so the model has the earlier turns. Deep Chat's Ollama client already defaults to `-1` (verified in the shipped bundle), but it is set explicitly here so the intent is legible rather than inherited.
- The model is set explicitly because the component's own default is the bare tag `llama3.2`, while this box has `llama3.2:latest`. Ollama resolves both against the same model, but pinning the full tag means the page does not silently change behaviour if the developer also has a differently-tagged `llama3.2` around.
- `stream: true` is **not** set. The Ollama client defaults it to `false`, and with `stream: false` the component still renders progressively because it reads Ollama's chunked response as a `ReadableStream`. If replies turn out to arrive all at once in the browser, adding `stream: true` is the one-line fix — but do not add it speculatively.
- Do **not** add a `remarkable` property. Deep Chat already renders message text through remarkable with `{ breaks: true, linkTarget: "_blank" }` as its own defaults; setting `html: true` would only let model output inject raw HTML.
- If the developer's Ollama is elsewhere, `url` is the only line that changes.

- [ ] **Step 4: Start the server and check every route**

Run `bun run dev` in the background (repo script: `bun --hot src/index.ts`), then:

```bash
curl -s localhost:3000/ ; echo
curl -s -o /dev/null -w "chat page: %{http_code} %{content_type}\n" localhost:3000/chat
curl -s -o /dev/null -w "bundle:    %{http_code} %{content_type} %{size_download} bytes\n" localhost:3000/deep-chat/deepChat.bundle.js
curl -s -i -X OPTIONS http://localhost:11434/api/chat \
  -H 'Origin: http://localhost:3000' | grep -i '^access-control-allow-origin'
```

Expected, all four:
- `{ ok: true }`
- `chat page: 200 text/html;charset=utf-8`
- `bundle: 200` and a JavaScript content type — the file is a few hundred KB, do not match on an exact size
- `Access-Control-Allow-Origin: http://localhost:3000`

If the bundle 404s, the `staticPlugin` `assets` path is wrong. A `/chat` request that 404s means the route is not registered; one that 500s with `ENOENT ... public/index.html` means the server was not started from the repo root.

- [ ] **Step 5: Stop the server and commit**

Run: `pkill -f src/index.ts`

```bash
git add src/index.ts public/index.html package.json bun.lock
git commit -m "feat: serve the Deep Chat page talking to Ollama"
```

---

### Task 3: Verify the chat works in a browser

**Files:** none. This task only observes; it changes nothing and commits nothing.

**Interfaces:**
- Consumes: the routes from Task 2.
- Produces: nothing. If verification fails, fix the cause as its own focused commit.

- [ ] **Step 1: Confirm the component upgrades and a reply streams back**

Run `bun run dev`, open <http://localhost:3000/chat>, and send:

> Show me a bash one-liner and a 3-item list.

Expected: the intro message is visible, the component renders full-height, the reply appears progressively rather than all at once, and the code block and bullet list render as formatting rather than raw backticks and hyphens.

- [ ] **Step 2: Confirm the model actually receives the conversation**

Send a follow-up in the same chat:

> What did I just ask you for?

Expected: the model answers with the earlier request. If it says it cannot see the previous message, `maxMessages` is not `-1`.

- [ ] **Step 3: Confirm a mid-reply stop halts generation**

Start a long generation (ask for a numbered list to fifty) and press Deep Chat's stop button mid-reply.

Expected: generation stops, the partial text stays in the bubble, and the process is responsive again. Note that with the browser calling Ollama directly, stopping is the browser aborting its own request — there is no server-side work to clean up, which is a simplification over the proxied design.

- [ ] **Step 4: Confirm the error path is visible, not silent**

Stop Ollama (`pkill ollama`), then send a message.

Expected: an error message in the chat area rather than an indefinite spinner or a blank bubble. Restart Ollama afterwards (`ollama serve`). This is Review Focus item 1, and the diagnosis is browser-console plus the `curl -i -X OPTIONS` CORS check from Task 2 Step 4 — not a code change here.

- [ ] **Step 5: Report the outcome**

State plainly what was observed. If everything passed, say so and stop — there is nothing to commit.

---

### Task 4: Document the chat page

**Files:**
- Create: `.env.example`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the routes from Task 2. No code.

- [ ] **Step 1: Create `.env.example`**

This file does not exist yet — it is untracked in the working tree. Create it, since `README.md` will point developers at it:

```
# Environment variables expected by this project.
# Copy this file to `.env` and fill in the real values. `.env` is gitignored.

# Run the Inngest SDK against the local Inngest dev server.
INNGEST_DEV=1

# Box API app token used by the Box integration.
BOX_APP_TOKEN=
```

No Ollama variables belong here: nothing in the server reads them, because the browser holds that configuration in `public/index.html`. Adding them would imply a server-side setting that does not exist.

- [ ] **Step 2: Update the `README.md` Usage section**

Keep standard-readme section order and keep the Table of Contents matching the headings. Replace the sentence `GET / returns { ok: true }.` with:

- `GET /` returns `{ ok: true }`.
- `GET /chat` serves a chat page that streams replies from a local
  [Ollama](https://ollama.com/) model.

Also add to the `Install` section, alongside the existing Podman and Bun bullets:

- [Ollama](https://ollama.com/) running locally with a model pulled
  (`ollama pull llama3.2`).

The chat page's Ollama URL is set in `public/index.html`, not in the environment — say so in one sentence there, because a developer looking for an env var will not find one.

- [ ] **Step 3: Add the changelog bullet**

Under `## [Unreleased]` → `### Added`, append one short user-facing bullet. Keep it about the shipped feature, not the implementation:

```markdown
- Full-page chat at `/chat` that streams replies from a local Ollama model.
```

Do not mention ADRs, `@elysiajs/static`, or deep-chat internals — ADR material is out of scope for the changelog.

- [ ] **Step 4: Verify the docs**

Read `README.md` top to bottom and confirm: the Table of Contents lists exactly the headings present, in order; the `docs/decisions/` link resolves; the short description is still under 120 characters. Confirm `.env.example` is not gitignored:

Run: `git check-ignore .env.example || echo "not ignored (good)"`
Expected: `not ignored (good)`.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md .env.example
git commit -m "docs: describe the chat page and its Ollama requirement"
```

---

### Task 5: Push the branch and open a PR

**Files:** none.

- [ ] **Step 1: Confirm the branch is coherent**

Run: `git log --oneline main..HEAD` and `git status --short`
Expected: four focused commits (Tasks 1, 2, 4, and the plan), clean working tree.

- [ ] **Step 2: Push**

Run: `git push -u origin feat/chatbot`
Expected: branch created on `origin` and tracking set. If push fails on auth or SSH key, report it and stop — do not switch to another remote or invent a URL.

- [ ] **Step 3: Open the PR against `main`**

Run: `gh pr create --base main --head feat/chatbot --title "Chat page backed by local Ollama" --body "..."`

The body should cover: `/chat` serves the page, the browser calls Ollama directly via the component's built-in client so there is no proxy or `/talk` route yet, the UI adds no frontend build step (ADR-0005), and verification was done by hand against a local Ollama. Do not reference an issue number unless one exists.

- [ ] **Step 4: Report the PR URL**

Paste it back to the human partner. Per AGENTS.md, each later round of review feedback gets its own commit and its own push — never batch rounds.