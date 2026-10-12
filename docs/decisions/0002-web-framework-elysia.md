---
status: accepted
date: 2026-10-12
decision-makers: William Van Steen
---

# Web framework Elysia on Bun

## Context and Problem Statement

We need a typed webhook plus JSON API layer for serving Inngest functions from the contract-features pipeline. Which web framework hosts the API and the Inngest serve endpoint?

## Decision Drivers

* FOSS only
* Typed request/response handling for webhooks and JSON API
* Simple API management for a small PoC team
* Runs on Bun (TypeScript runtime already intended for the pipeline)

## Considered Options

* Elysia on Bun
* Hono
* SvelteKit API routes

## Decision Outcome

Chosen option: "Elysia on Bun", because of preferred API ergonomics over Hono, while Svelte/Next-style framework API routes are frustrating for API management. Bun lock-in is accepted and no longer a downside.

### Consequences

* Good, because typed routes with built-in validation simplify the Inngest serve endpoint and JSON API.
* Good, because the API stays a separate, focused server instead of being folded into frontend routes.
* Bad, because Elysia requires the Bun runtime; the API cannot run on plain Node.js.

### Confirmation

Task 6 implements `src/index.ts` on Elysia; the Inngest serve endpoint responds through it.

## Pros and Cons of the Options

### Elysia on Bun

* Good, because preferred API ergonomics: schema-first typed routes with validation.
* Good, because FOSS (MIT).
* Bad, because locked to the Bun runtime.

### Hono

* Good, because runtime-agnostic and FOSS (MIT).
* Bad, because API ergonomics are less preferred than Elysia for this team.

### SvelteKit API routes

* Good, because co-located with the frontend and FOSS (MIT).
* Bad, because Svelte/Next-style framework API routes are frustrating for API management.

## More Information

Relied on by Task 6 for `src/index.ts`. Bun was already the intended runtime, so Bun lock-in adds no new constraint.
