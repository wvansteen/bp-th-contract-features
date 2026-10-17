---
status: accepted
date: 2026-10-12
decision-makers: William Van Steen
---

# Web framework Elysia on Bun

## Context and Problem Statement

The pipeline needs a typed webhook plus JSON API layer. Which framework
hosts it?

## Decision Drivers

- FOSS only.
- Typed routes for webhooks and JSON API.
- Runs on Bun.

## Considered Options

- Elysia on Bun
- Hono
- SvelteKit API routes

## Decision Outcome

Chosen option: "Elysia on Bun", because its ergonomics fit a typed
webhook layer; Bun lock-in is accepted.

### Consequences

- Good, because typed routes simplify the serve endpoint and JSON API.
- Bad, because the API cannot run on plain Node.js.

### Confirmation

`GET /` and `/api/inngest` respond on `:3000`.
