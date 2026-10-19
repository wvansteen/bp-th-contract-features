---
status: accepted
date: 2026-10-18
decision-makers: William Van Steen
---

# Server-side chat agent

## Context and Problem Statement

The chat panel calls a local Ollama model directly from the browser. The goal is
a chat experience served by this app's API that can later grow tool calls over
the ingested contract documents.

## Decision Drivers

- The OpenRouter key stays server-side
- One seam where tools and document access plug in
- No agent framework before a concrete tool need exists

## Considered Options

- Keep the browser's direct connection: a local model, or OpenRouter with the
  key in the browser
- An API-hosted thin agent over `src/openrouter/client.ts`
- A framework agent (LangChain) now

## Decision Outcome

Chosen option: "An API-hosted thin agent over `src/openrouter/client.ts`",
because the key must stay server-side and the tool-call follow-up should choose
a framework against real tool needs instead of guesses.

### Consequences

- Good, because there is one `ChatAgent` seam where tools and document access
  plug in.
- Bad, because the model cannot see the ingested documents until the follow-up
  lands.

### Confirmation

`public/index.html` sets `connect` to `/api/chat` and no file under `public/`
calls a model provider.
