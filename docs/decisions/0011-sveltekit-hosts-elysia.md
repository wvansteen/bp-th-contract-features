---
status: accepted
date: 2026-10-21
decision-makers: William Van Steen
---

# SvelteKit hosts the app, Elysia serves /api

## Context and Problem Statement

One Elysia process serves the static chat page, the JSON API, and the Inngest
handler. The UI should move to Svelte while the API stays in Elysia. Which
process starts and listens?

## Decision Drivers

- Svelte owns the UI, Elysia owns the API
- Backend and frontend code stay isolated
- Bun stays the runtime

## Considered Options

- SvelteKit hosts the app, with Elysia mounted at `/api`
- A Svelte SPA served by Elysia

## Decision Outcome

Chosen option: "SvelteKit hosts the app, with Elysia mounted at `/api`", because
SvelteKit already renders the page and Vercel deploys it natively.

### Consequences

- Good, because one process serves the page and every API.
- Good, because the Elysia app can move to its own repo behind a wrapper.
- Bad, because a request to `/api` passes through SvelteKit first.

### Confirmation

`GET /` and `GET /api/contracts` respond from one `mise run dev`.
