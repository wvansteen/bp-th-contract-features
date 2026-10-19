# Streaming Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The chat panel streams replies through `POST /api/chat`, where a thin
server-side chat agent calls OpenRouter instead of the browser calling a local
Ollama model.

**Architecture:** deep-chat's `connect` with `stream: true` posts its message
list to a new Elysia route, which answers with deep-chat's SSE format: one
`data: {"text":"<delta>"}` frame per model text delta, closing the stream to end
the reply. A `ChatAgent` maps deep-chat roles to model roles, prepends one
system prompt, and delegates to `OpenRouterClientPort.chatTextStream`, the
streaming sibling of the existing `complete` method. The browser sends the whole
conversation with every request and the server keeps no state.

**Tech Stack:** Bun 1.2.23, TypeScript strict with `noUncheckedIndexedAccess`,
Elysia, `@openrouter/sdk` 1.4.x, deep-chat 2.5.1, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-10-18-streaming-chat-design.md`

## Global Constraints

- Lint locks (errors): no `let`/`var`, no assignment to variables, parameters,
  or object properties, no `for`/`while`/`do` loops, no `any` including type
  assertions, no `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or `!`.
- Dependency injection: no env reads and no low-level client construction
  outside `src/deps.ts`; capabilities are passed as parameters.
- No em dashes anywhere: prose, comments, commit messages. Use commas, colons,
  parentheses, or a period.
- `verbatimModuleSyntax` is on: type-only imports use `import type`.
- Wire formats are fixed: request body
  `{messages: [{role: "user" | "ai", text: string}]}`; response
  `text/event-stream` with `data: {"text":"<delta>"}\n\n` frames that append to
  the bubble, `data: {"error":"<message>"}\n\n` frames for failures, and stream
  close to end the reply.
- Scope: text-only streaming chat. No files, no tool calls, no server-side
  history, no auth.
- Base branch: cut `feat/streaming-chat` from `feature/smart-features`, which
  provides `src/openrouter/client.ts`, `env.openRouterApiKey`,
  `deps.openRouterClient`, and ADRs 0007 and 0008. If `feature/smart-features`
  has merged into `main`, cut from `main` instead. New ADRs take the next free
  number in `docs/decisions/` (0009 on this base).
- Commands: `bun run format:check`, `bun run lint`, `bun run typecheck`,
  `bun test`. The pre-commit hook runs the gates itself.
- Integration: one branch, one PR. Open the PR against `feature/smart-features`
  while it is unmerged and retarget to `main` when it merges. One commit per
  task, one commit per review round. Never push to `main`.
- Docs: README stays standard-readme compliant; CHANGELOG bullets under
  `[Unreleased]` are short and user-facing.

## Review Focus

1. deep-chat labels assistant messages `"ai"`, which OpenRouter does not accept
   as a role. Sending it through unmapped breaks every reply that carries
   history. Pinned by
   `prepends the system prompt and maps deep-chat roles to model turns` (Task
   2).
2. deep-chat sends no history at all unless `requestBodyLimits.maxMessages` is
   set (`undefined` means input only), so a missing config silently turns the
   conversation into one-shot Q and A. Pinned by the follow-up question in the
   Task 4 smoke run, since the config lives in `public/index.html` and has no
   test harness.
3. Every SSE frame appends text to the bubble and the stream must close, or the
   loading bubble never ends and the submit button stays a stop button. Pinned
   by `streams deep-chat SSE frames and closes the stream` (Task 3).
4. A model failure mid-stream must surface an error bubble, not a hung stream.
   Pinned by `emits an error frame when the reply stream throws` (Task 3).
5. Clicking stop cancels the fetch; the server must end the model stream or
   abandoned replies keep generating tokens on the bill. Pinned by
   `cancelling the response body ends the reply stream` (Task 3).

---

### Task 1: ADR 0009 and streaming chat on the OpenRouter client

**Files:**

- Create: `docs/decisions/0009-server-side-chat-agent.md` (next free number)
- Modify: `src/openrouter/client.ts`
- Modify: `src/smart-features/classify.test.ts` (port fakes)
- Create: the branch, plus one docs commit for the plan and spec

**Interfaces:**

- Consumes: `OpenRouterClientPort`, `CompletionInput`, `createOpenRouterClient`
  as they exist on the base branch.
- Produces:
  `type ChatTurn = { role: "system" | "user" | "assistant"; content: string }`
  and `type ChatInput = { model: string; messages: readonly ChatTurn[] }` in
  `src/openrouter/client.ts`.
- Produces: `OpenRouterClientPort` gains
  `chatTextStream(input: ChatInput): AsyncIterable<string>`, yielding the reply
  text deltas in order.

There is no unit test for `chatTextStream`. It is thin glue to the SDK's stream,
the same status the base branch gives `complete`: the call and chunk shapes are
pinned by the SDK's generated types and `bun run typecheck`. The behavior above
it is tested in Tasks 2 and 3 against this interface.

- [ ] **Step 1: Create the branch and commit the design and plan documents**

```bash
git checkout -b feat/streaming-chat feature/smart-features
git add docs/superpowers/specs/2026-10-18-streaming-chat-design.md docs/superpowers/plans/2026-10-18-streaming-chat.md
git commit -m "docs: streaming chat design and implementation plan"
```

If executing in a fresh worktree, copy the two documents in from
`~/projects/bp-th-contract-features/docs/superpowers/` first. If
`feature/smart-features` is already merged, replace the branch base with `main`.

- [ ] **Step 2: Write ADR 0009**

Copy `docs/decisions/adr-template.md` to
`docs/decisions/0009-server-side-chat-agent.md` and fill it in at the leanness
`AGENTS.md` requires:

- `status: accepted`, `date: 2026-10-18`, `decision-makers: William Van Steen`.
- Context: the chat panel called a local Ollama model from the browser; the goal
  is a chat experience served by our API that can grow tool calls over the
  ingested contracts.
- Options: keep the browser's direct connection (local model, or OpenRouter with
  the key in the browser); an API-hosted thin agent over
  `src/openrouter/client.ts`; a framework agent (LangChain) now.
- Outcome: the API-hosted thin agent, because the key must stay server-side and
  the tool-call follow-up should choose a framework against real tool needs
  instead of guesses.
- Consequences: good, one `ChatAgent` seam where tools and document access plug
  in; bad, the model cannot see the ingested documents until the follow-up
  lands.
- Confirmation: `public/index.html` sets `connect` to `/api/chat` and no file
  under `public/` calls a model provider.

- [ ] **Step 3: Add `ChatTurn`, `ChatInput`, and `chatTextStream` to
      `src/openrouter/client.ts`**

Extend the port and its implementation, leaving `complete` untouched:

```ts
export type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};
export type ChatInput = { model: string; messages: readonly ChatTurn[] };

export interface OpenRouterClientPort {
  complete(input: CompletionInput): Promise<string>;
  chatTextStream(input: ChatInput): AsyncIterable<string>;
}
```

`chatTextStream` sends one streaming chat completion (`stream: true`, no
temperature override) with `input.messages` as the message list and yields each
chunk's text delta in order. The chunk field that holds the delta text comes
from the installed SDK's generated types; adapt to them, they are the source of
truth. When the SDK returns the non-stream shape, throw the same kind of error
`complete` throws. The mapping over the SDK's async iterable is a recursive
`async function*`, since the lint locks ban loops and mutable accumulators:

```ts
async function* textDeltas(
  chunks: AsyncIterator<ChatStreamChunk>,
): AsyncGenerator<string> {
  const next = await chunks.next();
  if (next.done) return;
  yield textOf(next.value);
  yield* textDeltas(chunks);
}
```

`textOf(chunk: ChatStreamChunk): string` extracts the delta text and returns
`""` when a chunk carries none.

- [ ] **Step 4: Update the `OpenRouterClientPort` fakes in existing tests**

The port gained a method, so every fake typed as `OpenRouterClientPort` in
`src/smart-features/classify.test.ts` gains a `chatTextStream` stub, matching
that file's style for unused methods. A local helper keeps it one line per fake:

```ts
async function* noChatText(): AsyncGenerator<string> {
  // The classifier never streams.
}
```

- [ ] **Step 5: Verify and commit**

Run: `bun run format:check && bun run lint && bun run typecheck && bun test`
Expected: PASS, all suites green including the untouched smart-features suite.

```bash
git add docs/decisions/0009-server-side-chat-agent.md src/openrouter/client.ts src/smart-features/classify.test.ts
git commit -m "feat: chat text streaming on the OpenRouter client"
```

---

### Task 2: Chat agent, model configuration, and wiring

**Files:**

- Create: `src/chat/agent.ts`
- Test: `src/chat/agent.test.ts`
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `src/deps.ts`

**Interfaces:**

- Consumes: `ChatInput`, `ChatTurn`, `OpenRouterClientPort.chatTextStream` (Task
  1).
- Produces: in `src/chat/agent.ts`
  - `type ChatMessage = { role: "user" | "ai"; text: string }`
  - `type ChatAgent = (input: { messages: readonly ChatMessage[] }) => AsyncIterable<string>`
  - `SYSTEM_PROMPT: string`
  - `createChatAgent(args: { client: OpenRouterClientPort; model: string }): ChatAgent`
- Produces: `Env` in `src/config/env.ts` gains `chatModel: string` from
  `CHAT_MODEL`, throwing `"CHAT_MODEL is required"` when missing, same as the
  other vars.
- Produces: `src/deps.ts` exports `chatAgent: ChatAgent`, built with
  `createChatAgent({ client: openRouterClient, model: env.chatModel })`.

- [ ] **Step 1: Write the failing agent tests**

`src/chat/agent.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createChatAgent, SYSTEM_PROMPT } from "./agent";
import type { OpenRouterClientPort } from "../openrouter/client";

async function* deltas(chunks: readonly string[]): AsyncGenerator<string> {
  yield* chunks;
}

describe("createChatAgent", () => {
  it("pins the system prompt copy", () => {
    expect(SYSTEM_PROMPT).toBe(
      "You are the Contract Investigation assistant for Lake County, Illinois. Answer questions in plain language. You cannot read the county's contract documents yourself in this version, so answer from what the conversation contains and say plainly when you do not know.",
    );
  });

  it("prepends the system prompt and maps deep-chat roles to model turns", async () => {
    const client: OpenRouterClientPort = {
      complete: () => Promise.reject(new Error("not used")),
      chatTextStream: (input) =>
        deltas([input.messages.map((m) => `${m.role}:${m.content}`).join("|")]),
    };
    const agent = createChatAgent({
      client,
      model: "deepseek/deepseek-v4.1-flash-1017",
    });

    const first = await agent({
      messages: [
        { role: "user", text: "hi" },
        { role: "ai", text: "hello" },
        { role: "user", text: "again" },
      ],
    })
      [Symbol.asyncIterator]()
      .next();

    expect(first.value).toBe(
      `system:${SYSTEM_PROMPT}|user:hi|assistant:hello|user:again`,
    );
  });

  it("passes the model id through", async () => {
    const client: OpenRouterClientPort = {
      complete: () => Promise.reject(new Error("not used")),
      chatTextStream: (input) => deltas([input.model]),
    };
    const agent = createChatAgent({
      client,
      model: "deepseek/deepseek-v4.1-flash-1017",
    });

    const first = await agent({
      messages: [{ role: "user", text: "hi" }],
    })
      [Symbol.asyncIterator]()
      .next();

    expect(first.value).toBe("deepseek/deepseek-v4.1-flash-1017");
  });

  it("yields the reply deltas unchanged", async () => {
    const agent = createChatAgent({
      client: {
        complete: () => Promise.reject(new Error("not used")),
        chatTextStream: () => deltas(["Hel", "lo"]),
      },
      model: "deepseek/deepseek-v4.1-flash-1017",
    });

    const iterator = agent({
      messages: [{ role: "user", text: "hi" }],
    })[Symbol.asyncIterator]();

    expect((await iterator.next()).value).toBe("Hel");
    expect((await iterator.next()).value).toBe("lo");
    expect((await iterator.next()).done).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/chat` Expected: FAIL, module `./agent` not found.

- [ ] **Step 3: Implement configuration, `src/chat/agent.ts`, and `src/deps.ts`
      wiring**

`src/config/env.ts` gains `chatModel: string` on `Env`, read from `CHAT_MODEL`,
with the same `"CHAT_MODEL is required"` throw style as the other vars.

`.env.example` gains, matching the existing comment style:

```
# OpenRouter model slug used by the chat assistant.
CHAT_MODEL=deepseek/deepseek-v4.1-flash-1017
```

`src/chat/agent.ts` holds exactly the types and copy from the Interfaces block.
`createChatAgent` returns a `ChatAgent` that maps the deep-chat turns onto model
turns and delegates:

- `SYSTEM_PROMPT` is exactly the string the first test pins.
- The turn mapping is
  `[ { role: "system", content: SYSTEM_PROMPT }, ...messages.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })) ]`.
- The returned function calls
  `client.chatTextStream({ model, messages: turns })` and returns that stream
  unchanged.

`src/deps.ts` exports `chatAgent` next to the other composed capabilities.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/chat` Expected: PASS, 4 tests.

- [ ] **Step 5: Verify and commit**

Run: `bun run format:check && bun run lint && bun run typecheck && bun test`
Expected: PASS.

```bash
git add src/chat src/config/env.ts .env.example src/deps.ts
git commit -m "feat: chat agent that streams model replies"
```

---

### Task 3: `POST /api/chat` SSE route

**Files:**

- Create: `src/routes/chat.ts`
- Test: `src/routes/chat.test.ts`
- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `ChatAgent`, `ChatMessage` (Task 2).
- Produces: `createChatRoutes(deps: { agent: ChatAgent }): Elysia` in
  `src/routes/chat.ts`, mounting `POST /api/chat`.

- [ ] **Step 1: Write the failing route tests**

`src/routes/chat.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { createChatRoutes } from "./chat";
import type { ChatAgent } from "../chat/agent";

async function* deltas(chunks: readonly string[]): AsyncGenerator<string> {
  yield* chunks;
}

const request = (body: unknown) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/chat", () => {
  it("streams deep-chat SSE frames and closes the stream", async () => {
    const response = await createChatRoutes({
      agent: () => deltas(["Hel", "lo"]),
    }).handle(request({ messages: [{ role: "user", text: "hi" }] }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe(
      'data: {"text":"Hel"}\n\ndata: {"text":"lo"}\n\n',
    );
  });

  it("passes the conversation to the agent", async () => {
    const agent: ChatAgent = ({ messages }) =>
      deltas([messages.map((m) => `${m.role}:${m.text}`).join("|")]);
    const response = await createChatRoutes({ agent }).handle(
      request({
        messages: [
          { role: "user", text: "hi" },
          { role: "ai", text: "hello" },
        ],
      }),
    );

    expect(await response.text()).toBe('data: {"text":"user:hi|ai:hello"}\n\n');
  });

  it("emits an error frame when the reply stream throws", async () => {
    async function* broken(): AsyncGenerator<string> {
      yield "Hel";
      throw new Error("model unavailable");
    }
    const response = await createChatRoutes({ agent: () => broken() }).handle(
      request({ messages: [{ role: "user", text: "hi" }] }),
    );

    expect(await response.text()).toBe(
      'data: {"text":"Hel"}\n\ndata: {"error":"model unavailable"}\n\n',
    );
  });

  it("rejects a role deep-chat never sends", async () => {
    const response = await createChatRoutes({ agent: () => deltas([]) }).handle(
      request({ messages: [{ role: "system", text: "hi" }] }),
    );

    expect(response.status).toBe(422);
  });

  it("cancelling the response body ends the reply stream", async () => {
    const pending = deltas(["Hel", "lo"]);
    const response = await createChatRoutes({ agent: () => pending }).handle(
      request({ messages: [{ role: "user", text: "hi" }] }),
    );

    await response.body?.cancel();

    expect((await pending.next()).done).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/routes/chat.test.ts` Expected: FAIL, module `./chat` not
found.

- [ ] **Step 3: Implement `src/routes/chat.ts` and mount it in `src/index.ts`**

The route is pure transport: validate the body, hand the turns to the agent,
wrap the reply deltas in deep-chat's SSE framing. The stream wrapper is the one
piece with a shape worth writing down, since it consumes the async iterable
without loops or mutable state:

```ts
const encoder = new TextEncoder();
const frame = (data: unknown): string => `data: ${JSON.stringify(data)}\n\n`;

const sseBody = (reply: AsyncIterable<string>): ReadableStream<Uint8Array> => {
  const iterator = reply[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(frame({ text: next.value })));
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            frame({
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
        controller.close();
      }
    },
    cancel() {
      void iterator.return?.();
    },
  });
};
```

`createChatRoutes({ agent })` returns an Elysia instance with one
`POST /api/chat` handler that returns
`new Response(sseBody(agent({ messages: body.messages })), { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } })`.
The body schema is
`t.Object({ messages: t.Array(t.Object({ role: t.Union([t.Literal("user"), t.Literal("ai")]), text: t.String() })) })`,
so the validated `role` type matches `ChatMessage["role"]` with no cast.
Elysia's validation failure is the 422 the last test expects.

Mount it in `src/index.ts` alongside the contracts routes:
`.use(createChatRoutes({ agent: chatAgent }))`, with `chatAgent` imported from
`./deps`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/routes/chat.test.ts` Expected: PASS, 5 tests.

- [ ] **Step 5: Verify and commit**

Run: `bun run format:check && bun run lint && bun run typecheck && bun test`
Expected: PASS.

```bash
git add src/routes/chat.ts src/routes/chat.test.ts src/index.ts
git commit -m "feat: stream chat replies from POST /api/chat"
```

---

### Task 4: Frontend switch, docs, smoke run, and pull request

**Files:**

- Modify: `public/index.html`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: `POST /api/chat` (Task 3).
- Produces: nothing code-shaped. The page stops talking to Ollama and talks to
  the app.

- [ ] **Step 1: Point the chat component at the app**

In `public/index.html`, replace the whole `chat.directConnection = {...}`
assignment with:

```js
chat.connect = { url: "/api/chat", stream: true };
// Keep the whole conversation in the request body. Without this,
// deep-chat sends only the latest input and follow-up questions lose
// their context.
chat.requestBodyLimits = { maxMessages: 0 };
```

Replace the intro message text with
`"Ask me anything. I am the Contract Investigation assistant."`, and in the
about paragraph replace the sentence "It runs against a model on this machine,
so contract text stays local." with "The assistant answers through this site's
own API, using a hosted language model." No other copy changes.

- [ ] **Step 2: Update the README**

- Install: delete the Ollama bullet
  (`- [Ollama](https://ollama.com/) running locally with a model pulled` with
  its `ollama pull llama3.2` line) and add `CHAT_MODEL` to the variable list in
  the `.env` sentence. On the base branch that sentence lists `BOX_APP_TOKEN`,
  `BOX_FOLDER_ID`, `OPENROUTER_API_KEY`, `OCR_MODEL`, and `SMART_FEATURE_MODEL`;
  if it reads differently, adjust to what is there.
- Usage: in the `GET /` bullet, replace "streams replies from a local
  [Ollama](https://ollama.com/) model; `/chat` redirects to `/`." with "streams
  replies from a hosted model through the app's `/api/chat` endpoint." The
  `/chat` redirect claim is stale, there is no such route in `src/index.ts`.
- Delete the paragraph "The page carries the chat's Ollama settings in
  `public/index.html`; nothing server-side reads Ollama environment variables."

- [ ] **Step 3: Update the CHANGELOG**

Under `[Unreleased]`, in `Changed` (add the heading after `Added` if it is not
there yet):

```markdown
- Chat replies now stream through the app's own API from a hosted model set by
  `CHAT_MODEL`, replacing the local Ollama model.
```

- [ ] **Step 4: Verify and commit**

Run: `bun run format:check && bun run lint && bun run typecheck && bun test`
Expected: PASS.

```bash
git add public/index.html README.md CHANGELOG.md
git commit -m "feat: stream chat replies through the app API"
```

- [ ] **Step 5: Smoke run (manual, not a test)**

There are no automated integration tests in this repo; this is the only
end-to-end check. Make sure `.env` carries `OPENROUTER_API_KEY` and
`CHAT_MODEL=deepseek/deepseek-v4.1-flash-1017`, then start the stack:

```sh
mise run dev:setup
mise run dev
```

Check the endpoint directly first:

```sh
curl -N -X POST http://localhost:<port>/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","text":"Reply with exactly three words."}]}'
```

Expected: several `data: {"text":"..."}` frames arriving incrementally and the
stream ending cleanly. Then open the printed URL in a browser and check all
three Review Focus behaviors that need a human: a question streams word by word,
the follow-up "What did I just ask?" answers with the earlier question (history
survives), and clicking stop mid-reply halts it. Paste the curl output and the
browser findings into the implementer report.

- [ ] **Step 6: Push the branch and open the pull request**

```bash
git push -u origin feat/streaming-chat
```

Open the PR against `feature/smart-features` while it is unmerged (retarget to
`main` once it merges) with `gh pr create`. Every later review round gets its
own commit and push.
