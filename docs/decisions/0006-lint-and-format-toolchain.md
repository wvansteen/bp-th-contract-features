---
status: accepted
date: 2026-10-17
decision-makers: William Van Steen
---

# Lint and format toolchain

## Context and Problem Statement

Violations of the project's functional style should fail at tool-call time,
not at review. The locks are behavioural: no `let`, no assignment, no loops,
no `any`.

## Decision Drivers

- The locks must be enforceable by an existing, supported tool.
- The rule set must be extensible.

## Considered Options

- `eslint-plugin-functional` with Prettier
- Biome
- Oxlint

## Decision Outcome

Chosen option: "`eslint-plugin-functional` with Prettier", because it is the
only option that ships the behavioural locks as supported rules and lets more
be added.

### Consequences

- Good, because the locks ship as supported rules and the set extends one line
  at a time.
- Bad, because it is two tools where Biome is one binary, and slower.

### Confirmation

`eslint.config.ts` exists and `bun run lint` exits non-zero on a file
containing `let x = 1;`.
