---
status: accepted
date: 2026-10-12
decision-makers: William Van Steen
---

# Bun version manager and bun scripts contract

## Context and Problem Statement

The Elysia API runs on host Bun (not containerized), while everything else runs in Podman Compose infra. Bun out of the box only follows `.bun-version` / `packageManager` conventions; unlike UV it does not auto-switch the local toolchain. How do we pin the Bun version reproducibly and define the `bun dev` entrypoints for local development?

## Decision Drivers

* Reproducible Bun version on a fresh clone without assuming a global `bun` version
* No global `bun` / `podman-compose` version assumed
* Self-contained `bun run dev` / `bun run dev:setup` entrypoints
* Tooling that reads the pin files where possible (`setup-bun`, Renovate)

## Considered Options

* Bun OOTB only (`.bun-version` / `packageManager` convention, no manager)
* asdf + asdf-bun (`.tool-versions`)
* mise (asdf-compatible, `.tool-versions`)

## Decision Outcome

Chosen option: "asdf-compatible manager (mise preferred, asdf acceptable)", because Bun itself does not enforce versions like UV, so local switching needs a manager; `setup-bun` / Renovate read the pin files but do not switch the local toolchain.

Contract:

* `bun run dev:setup` = `podman compose up -d` (start infra only).
* `bun run dev` = ensure infra, then `bun --hot src/index.ts` (i.e. `podman compose up -d && bun --hot src/index.ts`).
* Pin files `.tool-versions` + `packageManager` + `.bun-version` carry the same exact Bun version (concrete version chosen when Task 5 scaffolds the project).

### Consequences

* Good, because a fresh clone gets the same Bun version via mise or asdf.
* Good, because `bun run dev` / `bun run dev:setup` are the only documented entrypoints; no global binary versions assumed.
* Bad, because developers must install mise (preferred) or asdf; Bun alone will not switch versions.

### Confirmation

`grep -q "status: accepted" docs/decisions/0004-bun-version-and-scripts.md` passes; Task 5 creates the pin files and scripts relying on this contract.

## Pros and Cons of the Options

### Bun OOTB only

* Good, because no extra tool to install.
* Bad, because no local auto-switch; fresh clones silently use whatever global `bun` is installed.

### asdf + asdf-bun

* Good, because reads `.tool-versions` and switches the local Bun version.
* Bad, because slower / more setup than mise for this PoC.

### mise

* Good, because asdf-compatible (reads `.tool-versions`), preferred for speed and simplicity.
* Bad, because still an extra tool beyond Bun itself.

## More Information

Relied on by Task 5 (pin files `.tool-versions`, `.bun-version`, `packageManager`, scripts `dev` / `dev:setup`) and Task 6 (`bun --hot src/index.ts` serve loop).
