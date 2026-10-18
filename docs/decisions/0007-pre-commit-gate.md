---
status: accepted
date: 2026-10-17
decision-makers: William Van Steen
---

# Pre-commit gate

## Context and Problem Statement

The locks only help if a commit cannot be made without satisfying them. A gate
must therefore run the project's own checks and refuse a commit that fails one.

## Decision Drivers

- The gate must reject rather than rewrite.
- A build that passes must mean the types are sound.

## Considered Options

- husky pre-commit running format, lint, typecheck and build
- lint-staged on staged files
- No hook

## Decision Outcome

Chosen option: "husky 9 running all four under `set -e`", because lint-staged
only sees staged files and cannot cover a whole-project typecheck or build, and
because a hook that rewrites the working tree is itself a mutation.

### Consequences

- Good, because a commit cannot land unless format, lint, typecheck and build
  all pass.
- Bad, because every commit runs the whole project; there is no staged-file fast
  path.

### Confirmation

`.husky/pre-commit` starts with `set -e` and a commit with a deliberate `let` is
rejected.
