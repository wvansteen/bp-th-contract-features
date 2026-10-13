---
status: accepted
date: 2026-10-13
decision-makers: William Van Steen
---

# Bun version pinned once via packageManager

## Context and Problem Statement

ADR-0004 pinned the Bun version in three places (`.tool-versions`,
`.bun-version`, `packageManager`) to serve local version managers, CI
actions, and editor tooling. That support matrix is out of scope: this
repository has no CI, and only the tooling used in this repository needs
to work. Where is the single place to capture the Bun version?

## Decision Drivers

* The version is captured once, in one place.
* Only tooling used in this repository needs to read it; everything else
  is out of scope by default.
* The narrowest change that answers the question.

## Considered Options

* `packageManager` in `package.json` only
* Keep the three-file matrix from ADR-0004

## Decision Outcome

Chosen option: "`packageManager` in `package.json` only", because it is
the one place the repository's own tooling reads, and CI, editor, and
version-manager matrices are explicitly out of scope.

### Consequences

* Good, because one file states the version and there is no matrix to
  keep in sync.
* Bad, because external tools that read their own version files will not
  see the pin — accepted, since they are out of scope.

### Confirmation

`test ! -e .tool-versions && test ! -e .bun-version` passes,
`package.json` carries `"packageManager": "bun@<exact>"`, and no
references to the deleted files remain outside of history.

## Pros and Cons of the Options

### packageManager in package.json only

* Good, because it is a single source of truth for this repository's
  tooling.
* Bad, because tools outside this repository are not served — by design.

### Keep the three-file matrix from ADR-0004

* Good, because it covers more tools.
* Bad, because covering more tools is out of scope, and three files must
  be kept in sync for no in-repository benefit.

## More Information

Supersedes ADR-0004. The `dev` / `dev:setup` script contract from
ADR-0004 is unchanged.
