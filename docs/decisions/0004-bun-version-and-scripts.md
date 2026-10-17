---
status: accepted
date: 2026-10-13
decision-makers: William Van Steen
---

# Bun version pinned via packageManager

## Context and Problem Statement

The Elysia API runs on host Bun while everything else runs in containers. The
Bun version needs exactly one home that the repo tooling reads.

## Decision Drivers

- Single source of truth for the Bun version; nothing to keep in sync.

## Considered Options

- `packageManager` in `package.json`
- Separate version files (`.tool-versions`, `.bun-version`)

## Decision Outcome

Chosen option: "`packageManager` in `package.json`", because it is the one place
the repo tooling reads.

### Consequences

- Good, because one exact pin and nothing to keep in sync.
- Bad, because tools with their own version files will not see it.

### Confirmation

`package.json` carries `"packageManager": "bun@<exact>"`; no other version files
exist in the repository.
