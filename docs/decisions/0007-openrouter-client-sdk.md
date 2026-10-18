---
status: accepted
date: 2026-10-18
decision-makers: William Van Steen
---

# OpenRouter client SDK

## Context and Problem Statement

The pipeline calls OpenRouter chat completions to classify smart features. The
LLM stack is undecided, so the client the code talks to OpenRouter through is
still open.

## Decision Drivers

- The file content part these requests need
- Types generated from the API surface rather than hand-written
- One dependency behind the `OpenRouterClientPort`, so the rest of the code does
  not see the SDK

## Considered Options

- Official `@openrouter/sdk`
- Plain `fetch` against `POST /api/v1/chat/completions`
- OpenAI SDK pointed at OpenRouter

## Decision Outcome

Chosen option: "Official `@openrouter/sdk`", because it is the vendor SDK and
its generated types cover the file content part these requests need.

### Consequences

- Good, because the request and response shapes are pinned by the SDK's
  generated types and checked by `bun run typecheck`.
- Bad, because the SDK is one more dependency, and its types are the source of
  truth even when they disagree with the OpenRouter prose.

### Confirmation

`src/openrouter/client.ts` imports `@openrouter/sdk` and no file under `src/`
calls `openrouter.ai` over `fetch`: `grep -RQ "openrouter.ai" src/` returns
nothing.
