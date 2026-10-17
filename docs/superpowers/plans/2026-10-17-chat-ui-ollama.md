# Chat UI backed by Ollama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a full-page Deep Chat UI at `/chat` whose messages stream back from a local Ollama model through a new `POST /talk` endpoint.

**Architecture:** `deep-chat` is a self-contained web component, so no frontend framework or build step is added. Elysia serves `public/index.html` from a `GET /chat` route, serves the component bundle out of `node_modules` with `@elysiajs/static`, and mounts a `/talk` route that maps Deep Chat's request body to Ollama's `/api/chat` and re-emits Ollama's NDJSON chunks as SSE. `/talk` is stateless: whatever history Deep Chat sends goes straight to Ollama.

**Tech Stack:** Bun 1.2.23, TypeScript, Elysia 1.4.30, `@elysiajs/static`, `deep-chat` 2.5.1 (web component, no build step), Ollama (local, no key).

**Spec:** Conversational agreement with the human partner, recorded in this plan. No separate design doc — the decisions are captured in ADR-0005 (Task 1) and in the Global Constraints below.

## Global Constraints

- **Never invent URLs.** Only `origin` (`git@github.com:wvansteen/bp-th-contract-features.git`) is known. No changelog compare links, no issue links.
- **Ollama settings come from env, read at request time:** `OLLAMA_HOST` (default `http://127.0.0.1:11434`) and `OLLAMA_MODEL` (default `llama3.2:latest`). Read them inside the generator, not at module load, so nothing is captured at import time. Bun loads `.env` from the working directory on its own; no dotenv dependency.
- **Keep `GET /` returning `{ ok: true }`.** ADR-0002's confirmation check depends on it. The chat page lives at `/chat`.
- **The chat page is served by a `GET /chat` route that returns `Bun.file("public/index.html")`.** `public/` is *not* mounted as a static root; `@elysiajs/static` mounts only `node_modules/deep-chat/dist` under the `/deep-chat` prefix, so the component bundle is the only asset it serves.
- **SSE framing is exactly** `data: {"text":"..."}\n\n` — one `yield sse(JSON.stringify({ text }))` per chunk, per Deep Chat's `Response` type. Verified on Elysia 1.4.30: `sse()` is what adds the `data: ` framing *and* the `content-type: text/event-stream` header. A string yielded from the generator is passed through verbatim (a bare string arrives as `text/plain`, with no `data:` prefix), and Deep Chat's SSE parser would ignore it. So `sse()` is mandatory, and hand-writing `data:` strings buys nothing.
- **Deep Chat and Ollama disagree on the field name.** Deep Chat posts `{ messages: [{ role, text }] }`; Ollama's `/api/chat` wants `{ role, content }`. Ollama does **not** reject the wrong field — verified against a live Ollama: it returns `200` and answers *"It seems like you didn't specify a question or topic"*, which reads as a working-but-dumb model. Task 3 must map `text` → `content` explicitly.
- **Do not add a frontend build step, bundler config, or framework.** `deepChat.bundle.js` is served straight from `node_modules`.
- **Errors are a `200` with body `{ error: string }`** so Deep Chat renders them in an error bubble rather than leaving the request hanging. A body that fails the route schema (no `messages`, or an empty array) is a `422` with Elysia's validation JSON; Deep Chat's SSE reader turns a non-`ok` response into an error message, so that path is still visible in the UI.
- **Logging as a side effect is allowed**; keep it to `console.log` like the rest of the repo.
- **Style matches the repo:** double quotes, 2-space indent, `export const`, mostly functional, no classes.

## Review Focus

Conditions a reasonable person would hit that the happy-path tests will not cover, most likely first:

1. **Ollama is not running** (not installed, or crashed, or `OLLAMA_HOST` wrong). Expect a clear `{ error: "Unable to connect..." }` frame in the chat bubble, not a hang or a 500 page. Pinned by Task 3's "Ollama is unreachable" test, which makes `fetch` reject the way Bun does.
2. **The requested model is not pulled.** Ollama answers `404 {"error":"model 'x' not found"}`; that text must reach the bubble instead of an empty reply. Pinned by Task 2's "throws when Ollama returns an error body" test plus Task 3's "error frame" test.
3. **The user hits Deep Chat's stop button mid-reply.** Expect generation to halt server-side — the Ollama fetch is aborted and the partial text stays in the bubble. Verified by hand only: `talk.handle()` has no socket, so a unit test cannot observe a client disconnect (tried; the abort does not surface). Task 4 checks it against a running server.
4. **Request body is missing `messages`, or `messages` is empty.** Expect a `422` that Deep Chat shows as an error message, not a crash or a silent empty reply. Pinned by Task 3's schema test (`minItems: 1` covers the empty array).
5. **A message contains quotes, backslashes, or newlines.** Expect one well-formed SSE event per chunk with the payload unchanged — the JSON encoding must not mangle it and multi-line replies must not break framing. Pinned by Task 3's "quotes and newlines" test. *Rendering* the markdown is Deep Chat's own default behaviour, not ours: it always runs message text through remarkable and its defaults are already `{ breaks: true, linkTarget: "_blank" }`. Nothing to configure, nothing to test.

Tasks 2 and 3 pin items 1, 2, 4, and 5; Task 4 checks item 3 by hand.

---

## File Structure

- **`src/talk.ts`** — the `/talk` route and its SSE re-framing. Pure, exported, no `.listen()`. Owns the Deep Chat → Ollama field mapping.
- **`src/ollama.ts`** — `streamOllamaReply`: `messages` in, `AsyncGenerator<string>` of text chunks out, never SSE framing. Task 3 wraps each yield. Keeping it out of the route is what lets `src/ollama.test.ts` run against a fake `ReadableStream` with no network and no model.
- **`src/index.ts`** — mounts `.use(talk)`, `staticPlugin`, and the Inngest handler. Wiring only.
- **`public/index.html`** — the chat page. Markup plus three lines of element property assignment. No framework.
- **`docs/decisions/0005-chat-ui-without-frontend-build.md`** — records the no-build-tooling choice.

---

### Task 1: ADR for serving the chat UI without a frontend build

**Files:**
- Create: `docs/decisions/0005-chat-ui-without-frontend-build.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by code. Documents why `public/index.html` + `deepChat.bundle.js` is served directly and why no Svelte/Vite/SvelteKit toolchain was added.

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

Context (2-3 sentences): the chat UI needs a component library; `deep-chat` is a web component that runs from one bundled script, but the repo has no frontend build tooling and neither Elysia nor the Bun dev server needs one, so the Svelte options would each add a toolchain to answer a problem we do not have.

Considered Options: exactly these three, one line each:
- SvelteKit hosting Elysia via a `+server.ts` fallback
- Vite + Svelte, served by Elysia
- No framework: static HTML plus `deepChat.bundle.js` from `node_modules`

Outcome: `Chosen option: "No framework: static HTML plus deepChat.bundle.js from node_modules", because the component needs no build step and the PoC does not yet need a frontend toolchain.` One line why.

Consequences, terse: Good — one dependency, no build config, `bun run dev` stays the only command. Bad — no component model or HMR for the frontend; revisit when the UI outgrows a single file.

Confirmation (one line, per the template's convention): `GET /chat` returns the Deep Chat page and `GET /talk` streams a model reply on `:3000`.

- [ ] **Step 2: Verify the ADR matches the template and the repo's other ADRs**

Run: `head -7 docs/decisions/0005-chat-ui-without-frontend-build.md`
Expected: `---`, `status: accepted`, `date: 2026-10-17`, `decision-makers: William Van Steen`, `---`, a blank line, then the `# ` title.

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0005-chat-ui-without-frontend-build.md
git commit -m "docs: ADR for serving the chat UI without a frontend build"
```

---

### Task 2: Ollama NDJSON stream reader

**Files:**
- Create: `src/ollama.ts`
- Create: `src/ollama.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  ```ts
  export function parseOllamaLine(line: string): string | null
  export async function* streamOllamaReply(
    body: { messages: { role: string; content: string }[] },
    signal?: AbortSignal,
  ): AsyncGenerator<string>
  ```
  `streamOllamaReply` yields raw text chunks (`"Hello "`, `"world"`), never SSE framing. Reads `OLLAMA_HOST` / `OLLAMA_MODEL` from `process.env` at call time with the Global Constraints defaults.

- [ ] **Step 1: Write the failing tests in `src/ollama.test.ts`**

```ts
import { afterEach, expect, test } from "bun:test";
import { parseOllamaLine, streamOllamaReply } from "./ollama";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ndjson = (...lines: string[]) =>
  new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      for (const line of lines) c.enqueue(enc.encode(line + "\n"));
      c.close();
    },
  });

const stubOllama = (response: Response) => {
  globalThis.fetch = (async () => response) as typeof fetch;
};

const ask = async (text: string) => {
  const chunks: string[] = [];
  for await (const chunk of streamOllamaReply({ messages: [{ role: "user", content: text }] })) {
    chunks.push(chunk);
  }
  return chunks;
};

test("parseOllamaLine extracts message content", () => {
  const line = JSON.stringify({ message: { role: "assistant", content: "Hello " }, done: false });
  expect(parseOllamaLine(line)).toBe("Hello ");
});

test("parseOllamaLine returns null on the final done chunk", () => {
  const line = JSON.stringify({ message: { role: "assistant", content: "" }, done: true });
  expect(parseOllamaLine(line)).toBeNull();
});

test("parseOllamaLine returns null for malformed json", () => {
  expect(parseOllamaLine("not json")).toBeNull();
});

test("streamOllamaReply yields each non-empty content chunk", async () => {
  stubOllama(new Response(ndjson(
    JSON.stringify({ message: { content: "Four" }, done: false }),
    JSON.stringify({ message: { content: "." }, done: false }),
    JSON.stringify({ message: { content: "" }, done: true }),
  )));

  expect(await ask("Count")).toEqual(["Four", "."]);
});

test("streamOllamaReply throws when Ollama returns an error body", async () => {
  stubOllama(new Response(JSON.stringify({ error: "model 'nope' not found" }), { status: 404 }));

  let message = "";
  try {
    await ask("hi");
  } catch (error) {
    message = (error as Error).message;
  }

  expect(message).toContain("nope");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/ollama.test.ts`
Expected: FAIL — `Cannot find module './ollama'`.

- [ ] **Step 3: Implement `src/ollama.ts`**

```ts
export function parseOllamaLine(line: string): string | null {
  try {
    const chunk = JSON.parse(line);
    return chunk.done === true ? null : (chunk.message?.content || null);
  } catch {
    return null;
  }
}

export async function* streamOllamaReply(
  body: { messages: { role: string; content: string }[] },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const host = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? "llama3.2:latest",
      messages: body.messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.error ?? `Ollama replied ${response.status}`);
  }
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const text = parseOllamaLine(line);
      if (text !== null) yield text;
    }
  }
}
```

Pinned decisions, all verified against a live Ollama 0.12.9 — do not "improve" these without re-checking:

- Ollama's `/api/chat` answers `200` with `content-type: application/x-ndjson`: **one JSON object per line, `\n`-terminated, including the final `done: true` line**.
- `decoder.decode(value, { stream: true })` — the `{ stream: true }` carries a multi-byte character that lands on a read boundary instead of turning it into `U+FFFD`.
- `lines.pop()` is the carry-over: a read can end mid-line, so keep the remainder in `pending` rather than dropping a partial chunk.
- `done === true` ends generation. Yield `message.content` verbatim — no trimming, no reformatting.
- `response.json().catch(() => null)` keeps the `error` field out of Ollama's non-2xx bodies without a `try`/`catch`; the status is the fallback.
- Passing `signal` straight through is what makes an aborted client request actually stop generation. Nothing else to configure.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/ollama.test.ts`
Expected: PASS — 5 tests, 0 failures, no network access.

- [ ] **Step 5: Commit**

```bash
git add src/ollama.ts src/ollama.test.ts
git commit -m "feat: read Ollama NDJSON chat streams"
```

---

### Task 3: `POST /talk` streaming route

**Files:**
- Create: `src/talk.ts`
- Create: `src/talk.test.ts`

**Interfaces:**
- Consumes: `streamOllamaReply` from `src/ollama.ts` (Task 2).
- Produces: `export const talk: Elysia` — an unmounted Elysia instance with exactly one route, `POST /talk`. `src/index.ts` mounts it via `.use(talk)`. Tests import it directly and call `talk.handle(request)` — no port is bound.

- [ ] **Step 1: Write the failing tests in `src/talk.test.ts`**

```ts
import { afterEach, expect, test } from "bun:test";
import { talk } from "./talk";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const post = (body: unknown) =>
  talk.handle(new Request("http://localhost/talk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

let sent: any;

const stubOllama = (chunks: string[]) => {
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    sent = JSON.parse(init.body);
    return new Response(new ReadableStream({
      start(c) {
        const enc = new TextEncoder();
        for (const chunk of chunks) {
          c.enqueue(enc.encode(JSON.stringify({ message: { content: chunk }, done: false }) + "\n"));
        }
        c.close();
      },
    }));
  }) as typeof fetch;
};

const frames = (body: string) =>
  body.split("\n\n").filter(Boolean).map((frame) => JSON.parse(frame.replace(/^data: /, "")));

test("streams an Ollama reply as Deep Chat SSE", async () => {
  stubOllama(["Hi", " there"]);

  const res = await post({ messages: [{ role: "user", text: "hello" }] });

  expect(res.headers.get("content-type")).toContain("text/event-stream");
  expect(await res.text()).toBe('data: {"text":"Hi"}\n\ndata: {"text":" there"}\n\n');
});

test("keeps a chunk with quotes and newlines in one event", async () => {
  stubOllama(['line 1\nline 2 "quoted" \\ back']);

  const res = await post({ messages: [{ role: "user", text: "hello" }] });

  expect(frames(await res.text())).toEqual([{ text: 'line 1\nline 2 "quoted" \\ back' }]);
});

test("sends Deep Chat's `text` to Ollama as `content`", async () => {
  stubOllama(["ok"]);

  await (await post({ messages: [{ role: "user", text: "hello there" }] })).text();

  expect(sent.messages).toEqual([{ role: "user", content: "hello there" }]);
});

test("returns an error frame when Ollama replies with an error body", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "model 'nope' not found" }), { status: 404 })) as typeof fetch;

  const res = await post({ messages: [{ role: "user", text: "hi" }] });

  expect(res.status).toBe(200);
  expect(frames(await res.text())).toEqual([{ error: "model 'nope' not found" }]);
});

test("returns an error frame when Ollama is unreachable", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("Unable to connect. Is the computer able to access the url?");
  }) as typeof fetch;

  const res = await post({ messages: [{ role: "user", text: "hi" }] });

  expect(res.status).toBe(200);
  expect(frames(await res.text())).toEqual([
    { error: "Unable to connect. Is the computer able to access the url?" },
  ]);
});

test("rejects a request with no messages and one with an empty array", async () => {
  expect((await post({})).status).toBe(422);
  expect((await post({ messages: [] })).status).toBe(422);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/talk.test.ts`
Expected: FAIL — `Cannot find module './talk'`.

- [ ] **Step 3: Implement `src/talk.ts`**

```ts
import { Elysia, sse, t } from "elysia";
import { streamOllamaReply } from "./ollama";

export const talk = new Elysia().post(
  "/talk",
  // async function* because the loop below is `for await`
  async function* ({ body, request }) {
    // Deep Chat sends `text`; Ollama expects `content`. Without this mapping
    // Ollama answers a different question and still returns 200.
    const messages = body.messages.map(({ role = "user", text = "" }) => ({ role, content: text }));
    try {
      for await (const chunk of streamOllamaReply({ messages }, request.signal)) {
        yield sse(JSON.stringify({ text: chunk }));
      }
    } catch (error) {
      yield sse(JSON.stringify({ error: (error as Error).message }));
    }
  },
  {
    body: t.Object({
      messages: t.Array(
        t.Object({ role: t.Optional(t.String()), text: t.Optional(t.String()) }),
        { minItems: 1 },
      ),
    }),
  },
);
```

Notes that matter:

- The handler **must be an `async function*`** — the `for await` over `streamOllamaReply` is a syntax error inside a sync generator, so the generator has to be async. This exact shape was run against live Ollama and produced SSE frames that reassemble to the model's reply.
- `yield sse(JSON.stringify({ text: chunk }))`, never a hand-written `data:` string. See the Global Constraints for what `sse()` does and why the alternative fails.
- `role` and `text` are `t.Optional` because Deep Chat's `MessageContent` has both optional; `minItems: 1` turns an empty `messages` array into a `422` too, instead of a silent empty reply. Elysia's schema tolerates the extra properties Deep Chat puts on a message (`html`, `files`, `custom`, `_sessionId`) and on the body itself — verified, they do not trip validation.
- `request.signal` is what makes Deep Chat's stop button abort the Ollama fetch instead of leaving CPU busy.
- Catch and `yield sse({ error })` rather than throwing, so the client sees the failure in an error bubble.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/talk.test.ts`
Expected: PASS — 6 tests, 0 failures.

- [ ] **Step 5: Run the whole suite**

Run: `bun test`
Expected: PASS — 11 tests, 0 failures (5 from `ollama.test.ts`, 6 from `talk.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/talk.ts src/talk.test.ts
git commit -m "feat: POST /talk streaming proxy to Ollama"
```

---

### Task 4: Wire the server and serve the chat page

**Files:**
- Modify: `src/index.ts`
- Create: `public/index.html`

**Interfaces:**
- Consumes: `talk` from `src/talk.ts` (Task 3).
- Produces: `GET /` → `{ok: true}` (unchanged), `POST /talk` → SSE, `GET /chat` → the Deep Chat page, `GET /deep-chat/deepChat.bundle.js` → the component bundle, `ALL /api/inngest` → unchanged.

- [ ] **Step 1: Add `@elysiajs/static` and `deep-chat`**

Run: `bun add @elysiajs/static deep-chat`
Expected: both added to `package.json` dependencies, lockfile updated.

- [ ] **Step 2: Rewrite `src/index.ts`**

```ts
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import { serve } from "inngest/bun";
import { helloWorld } from "./functions/hello";
import { inngest } from "./inngest";
import { talk } from "./talk";

const handler = serve({ client: inngest, functions: [helloWorld] });

const app = new Elysia()
  .use(talk)
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

Notes: the import list is alphabetical, matching the existing file's style. `staticPlugin` is `await`ed per the plugin's docs. `prefix: "/deep-chat"` serves the bundle from `node_modules/deep-chat/dist`; the page references `/deep-chat/deepChat.bundle.js`. `Bun.file` returns `200` with `content-type: text/html;charset=utf-8`.

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
      chat.connect = { url: "/talk", method: "POST", stream: true };
      chat.introMessage = { text: "Ask me anything. I am running locally on Ollama." };
    </script>
  </body>
</html>
```

The `height: 100%` rules are what make it a *full-page* chat; without them Deep Chat collapses to a short box. Do not add a `remarkable` property: Deep Chat already renders message text through remarkable with `{ breaks: true, linkTarget: "_blank" }`, and `html: true` would only let model output inject raw HTML.

- [ ] **Step 4: Start the server and verify every route by hand**

Run: `bun run dev` in the background (repo script: `bun --hot src/index.ts`), then:

```bash
curl -s localhost:3000/ ; echo
curl -s -o /dev/null -w "chat page: %{http_code} %{content_type}\n" localhost:3000/chat
curl -s -o /dev/null -w "bundle:    %{http_code} %{content_type} %{size_download} bytes\n" localhost:3000/deep-chat/deepChat.bundle.js
curl -sN -X POST localhost:3000/talk \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","text":"say hi"}]}' | head -5
```

Expected, all four:
- `{ ok: true }`
- `chat page: 200 text/html;charset=utf-8`
- `bundle: 200` and a JavaScript content type — the file is a few hundred KB, do not match on an exact size
- SSE lines of the form `data: {"text":"..."}`

If the bundle 404s, the `staticPlugin` `assets` path is wrong. A `/chat` request that 404s means the route is not registered; one that 500s with `ENOENT ... public/index.html` means the server was not started from the repo root.

- [ ] **Step 5: Verify the stop-button behaviour (the SSE stream aborts early)**

```bash
curl -sN --max-time 2 -X POST localhost:3000/talk \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","text":"count from one to fifty slowly"}]}' | tail -2
```

Expected: a few `data:` lines, then curl stops on its own 2-second budget with the reply clearly unfinished — the server stopped pushing when the client went away, and the aborted Ollama generation stops the GPU/CPU. Confirm it stopped by watching the load drop, **not** by looking for the `ollama runner` process: Ollama keeps a loaded model resident between requests, so that process is expected to outlive the request.

- [ ] **Step 6: Stop the server and commit**

Run: `pkill -f src/index.ts`

```bash
git add src/index.ts public/index.html package.json bun.lock
git commit -m "feat: serve the Deep Chat page and mount /talk"
```

---

### Task 5: Document the chat page

**Files:**
- Create: `.env.example` (it does not exist yet; `.gitignore` already whitelists it)
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the routes and env vars from Tasks 3-4. No code.

- [ ] **Step 1: Create `.env.example`**

It does not exist in the repo, so create it with the two settings Bun picks up from `.env` on its own:

```
# Ollama used by the chat page at /chat.
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:latest
```

- [ ] **Step 2: Update the `README.md` Usage section**

Keep standard-readme section order and keep the Table of Contents matching the headings. Change the sentence `GET / returns { ok: true }.` to describe both surfaces, naming real routes:

- `GET /` returns `{ ok: true }`.
- `GET /chat` serves the Deep Chat page, backed by `POST /talk`, which streams replies from Ollama.

Also add to the `Install` list: "A local [Ollama](https://ollama.com/) server with the model pulled (`ollama pull llama3.2`)."

- [ ] **Step 3: Add the changelog bullet**

Under `## [Unreleased]` → `### Added`, append one short user-facing bullet. Keep it about the shipped feature, not the implementation:

```markdown
- Full-page chat at `/chat` that streams replies from a local Ollama model.
```

Do not mention ADRs, `@elysiajs/static`, or deep-chat internals — ADR material is out of scope for the changelog.

- [ ] **Step 4: Verify the docs**

Read `README.md` top to bottom and confirm: the Table of Contents lists exactly the headings present, in order; the `docs/decisions/` link resolves; the short description is still under 120 characters. Then run `bun test` — expected: PASS, 11 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md .env.example
git commit -m "docs: describe the chat page and Ollama settings"
```

---

### Task 6: Push the branch and open a PR

**Files:** none.

- [ ] **Step 1: Confirm the branch is coherent**

Run: `git log --oneline main..HEAD` and `git status --short`
Expected: five focused commits (Tasks 1-5), clean working tree.

- [ ] **Step 2: Push**

Run: `git push -u origin feat/chatbot`
Expected: branch created on `origin` and tracking set. If push fails on auth or SSH key, report it and stop — do not switch to another remote or invent a URL.

- [ ] **Step 3: Open the PR against `main`**

Run: `gh pr create --base main --head feat/chatbot --title "Chat page backed by local Ollama" --body "..."`

The body should cover: what `/chat` and `/talk` do, that `/talk` is stateless, that the UI adds no frontend build step (ADR-0005), and that verification was done by hand against a local Ollama plus `bun test`. Do not reference an issue number unless one exists.

- [ ] **Step 4: Report the PR URL**

Paste it back to the human partner. Per AGENTS.md, each later round of review feedback gets its own commit and its own push — never batch rounds.
