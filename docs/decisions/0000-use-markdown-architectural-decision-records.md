---
status: accepted
date: 2026-10-12
decision-makers: William Van Steen
---

# Use Markdown Architectural Decision Records

## Context and Problem Statement

Starting from zero, with the problem space still open, we will make many
technical decisions. How do we record them so the rationale survives and
a newcomer can see why the system is the way it is?

## Decision Drivers

- Captured with the code, versioned with it.
- Low friction: no special tooling or accounts.
- Plain text, readable by people and automation.
- A known convention, so nobody has to explain the format.

## Considered Options

- Markdown Architectural Decision Records (MADR)
- Nygard-style ADRs (the original short format)
- Decisions implicit in pull requests, commits, and chat
- Free-form design documents or a wiki

## Decision Outcome

Chosen option: "Markdown Architectural Decision Records (MADR)", because
it is plain Markdown in version control with a clear structure and an
established convention.

### Consequences

- Good, because rationale is recorded next to the code and reviewed like
  any change.
- Good, because a newcomer can read the decisions directory and start
  quickly.
- Bad, because decisions made without an ADR drift from the record, and
  trivial choices add noise, so we record architectural ones only.

### Confirmation

ADRs live in [`docs/decisions/`](./) and ship in the pull request that
needs them. New ones start from [`adr-template.md`](./adr-template.md).

## More Information

- [MADR](https://adr.github.io/madr/) and
  [background](https://adr.github.io/) on the practice.
