---
status: accepted
date: 2026-10-19
decision-makers: William Van Steen
---

# Vercel experimental backends mode for the Elysia app

## Context and Problem Statement

Vercel's default Elysia build emits an ESM function with extensionless relative
imports and does not emit `public/`. The deployed Bun runtime exits with
`ResolveMessage` on `/contracts`, and `/` points at a file the function does not
carry.

## Decision Drivers

- Deploy the existing Bun source without rewriting imports for Node.
- Ship `public/` so `/` resolves.

## Considered Options

- Raise `bunVersion` to `1.4.x`
- Vercel experimental backends mode with a bundled build command
- Node runtime with `.js` import extensions and `file()`

## Decision Outcome

Chosen option: "Vercel experimental backends mode", because one bundled file
removes the runtime relative-import graph and the build emits `public/` as
static output.

### Consequences

- Good, because no source changes are needed.
- Bad, because it depends on an experimental Vercel flag and the build command
  must run `bun run build`.

### Confirmation

`.vercel/output/functions/index.func/.vc-config.json` maps the handler to
`dist/index.js`, includes `node_modules/deep-chat/dist/deepChat.bundle.js`, and
`.vercel/output/static/index.html` exists.
