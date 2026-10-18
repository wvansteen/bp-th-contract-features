# Streaming Chat Design

## Intent

The chat panel's replies stop coming from the browser's direct call to a local
Ollama instance. The page calls this app's own API, and the API drives a chat
agent over OpenRouter. This lands the seam where tool calls and document access
plug in as the follow-up feature.

Success looks like the chat panel behaving exactly as it does today: replies
appear word by word as they are generated. The difference is that the model, the
API key, and the conversation logic live on the server.

## Goals

- `POST /api/chat` accepts deep-chat's request format and answers with
  deep-chat's SSE format, streaming text as the model produces it.
- A `ChatAgent` seam on the server: chat messages in, reply text deltas out. The
  tool-call follow-up extends this seam instead of replacing it.
- The model id and the API key are server configuration (`CHAT_MODEL`,
  `OPENROUTER_API_KEY`); the browser holds neither.

## Non-goals

- Tool calls, retrieval, or any grounding in the ingested contract documents.
  That is the follow-up feature.
- File attachments, speech input or output, custom message roles.
- Server-side conversation persistence. History is client-sent and every request
  is stateless.
- Authentication.
- Adopting LangChain or any other agent framework.

## Anti-goals

- The OpenRouter key in browser code. No `directConnection.openRouter`.
- A second OpenRouter client next to `src/openrouter/client.ts`.
- Adopting an agent framework before a concrete tool need exists.
- Simulated streaming when the model streams for real.

## Constraints

- The lint locks and the dependency injection rule from `AGENTS.md` apply
  unchanged, and no em dashes anywhere in prose, comments, or commits.
- Built on `feature/smart-features`, which already provides
  `src/openrouter/client.ts`, `env.openRouterApiKey`, and
  `deps.openRouterClient`.
- deep-chat 2.5.1 wire formats. The plan states them exactly: the request body
  `{messages: [{role, text}]}`, and the SSE response `data: {"text":"<delta>"}`
  frames that append to the message bubble and close to end the reply.

## Decided

- **Transport.** The component's `connect` property with `stream: true` pointed
  at `/api/chat`. The route answers with `text/event-stream`, one
  `data: {"text":"<delta>"}\n\n` frame per model delta, closing the stream ends
  the reply. Failures mid-stream send `data: {"error":"<message>"}\n\n` so the
  chat shows an error bubble instead of hanging.
- **History.** Client-sent. `requestBodyLimits = { maxMessages: 0 }` keeps the
  whole conversation in every request, which matches today's Ollama setup
  (`maxMessages: -1`). The server keeps no state, so no conversation storage
  schema is needed yet.
- **Agent.** A thin module, no framework. It maps deep-chat roles to model roles
  (`"ai"` becomes `"assistant"`), prepends one system prompt, and delegates to
  `OpenRouterClientPort.chatTextStream`. LangChain is deferred to the tool-call
  follow-up, which reopens that question as its own decision with real tool
  needs on the table.
- **Model.** `CHAT_MODEL`, required like the other config vars, with the
  documented default `deepseek/deepseek-v4.1-flash-1017` filled in
  `.env.example`. This mirrors how `SMART_FEATURE_MODEL` works on the base
  branch.
- **Route path.** `/api/chat`, because the README already claims `/chat` as the
  page's redirect.
- **Copy.** My calls, edit freely:
  - System prompt: "You are the Contract Investigation assistant for Lake
    County, Illinois. Answer questions in plain language. You cannot read the
    county's contract documents yourself in this version, so answer from what
    the conversation contains and say plainly when you do not know."
  - Intro message: "Ask me anything. I am the Contract Investigation assistant."
  - In the page's about paragraph, replace "It runs against a model on this
    machine, so contract text stays local." with "The assistant answers through
    this site's own API, using a hosted language model."
- Page copy outside those lines is untouched, including the aspirational hero
  text about clauses. It overpromises equally before and after this change.

## Left to the builder

- The exact `@openrouter/sdk` streaming call. The installed generated types are
  the source of truth; adapt to them as the base branch's `complete` did.
- Test fakes for `AsyncIterable<string>`. Async generator helpers satisfy the
  lint locks and the repo's no-spy assertion style.
- Error copy inside the error frame. The thrown error's message is enough.
