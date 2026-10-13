---
status: accepted
date: 2026-10-13
decision-makers: William Van Steen
---

# Bun version pinned via packageManager

## Context and Problem Statement

The Elysia API runs on host Bun while everything else runs in Podman
containers. The Bun version must be captured in exactly one place that
this repository's tooling reads.

## Decision Drivers

* Single source of truth for the Bun version; nothing to keep in sync.

## Considered Options

* `packageManager` in `package.json`
* Separate version files (`.tool-versions`, `.bun-version`)

## Decision Outcome

Chosen option: "`packageManager` in `package.json`", because it is the
one place this repository's tooling reads. CI, editor, and
version-manager matrices are out of scope.

### Consequences

* Good, because one exact pin and nothing to keep in sync.
* Bad, because external tools with their own version files will not see
  the pin — accepted.

### Confirmation

`package.json` carries `"packageManager": "bun@<exact>"`; no other
version files exist in the repository.
