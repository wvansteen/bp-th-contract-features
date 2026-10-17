---
status: accepted
date: 2026-10-17
decision-makers: William Van Steen
---

# Chat UI served without a frontend build step

## Context and Problem Statement

The chat UI needs a component library. `deep-chat` is a web component
that runs from one pre-built script, and the repo has no frontend build
tooling, so each Svelte option would add a toolchain to answer a problem
we do not have. The component also ships a built-in Ollama client, so
the first version needs no server-side LLM route.

## Decision Drivers

- No frontend toolchain to keep in step with the API.
- No server-side LLM code to maintain.

## Considered Options

- SvelteKit hosting Elysia via a `+server.ts` fallback
- Vite + Svelte, served by Elysia
- Static HTML plus a server-side `/talk` proxy to Ollama
- Static HTML plus `directConnection` to Ollama from the browser

## Decision Outcome

Chosen option: "Static HTML plus directConnection to Ollama from the
browser", because the component already speaks Ollama's API, so a
proxy would be code that only re-encapsulates a library.

### Consequences

- Good, because no frontend toolchain and no proxy code;
  `bun run dev` stays the only command.
- Bad, because the browser needs Ollama reachable and CORS-permitted,
  the Ollama endpoint is fixed at `localhost:11434` and not
  configurable from the page, and a hosted model would need a proxy
  later; revisit when one of these bites.

### Confirmation

`GET /chat` serves the chat page on `:3000` and a message in the
browser streams a reply back from Ollama.
