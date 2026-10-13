---
status: accepted
date: 2026-10-12
decision-makers: William Van Steen
---

# Web framework Elysia on Bun

## Context and Problem Statement

The pipeline needs a typed webhook plus JSON API layer to serve Inngest
functions. Which framework hosts the API and the serve endpoint?

## Decision Drivers

* FOSS only.
* Typed routes for webhooks and JSON API.
* Runs on Bun.

## Considered Options

* Elysia on Bun
* Hono
* SvelteKit API routes

## Decision Outcome

Chosen option: "Elysia on Bun", because of preferred API ergonomics;
Svelte/Next-style framework routes are frustrating for API management.
Bun lock-in is accepted.

### Consequences

* Good, because typed routes simplify the serve endpoint and JSON API.
* Bad, because the API cannot run on plain Node.js.

### Confirmation

`GET /` and `/api/inngest` respond on `:3000`.
