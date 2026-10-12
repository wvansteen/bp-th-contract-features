---
status: accepted
date: 2026-10-12
decision-makers: William Van Steen
---

# Use Markdown Architectural Decision Records

## Context and Problem Statement

This project is starting from a state of zero, and its problem space — what
contract documents are and how a generative AI pipeline should structure and
interact with them — is still being discovered. We expect to make many
significant technical decisions along the way. How should we record those
decisions so that their rationale survives, and so that a new contributor
(human or agent) can understand *why* the system is the way it is without
having to reconstruct it from the code?

## Decision Drivers

* Decisions and their rationale should be captured close to the code and
  versioned with it.
* The mechanism should be low-friction: writing a decision should not require
  special tooling, accounts, or a running server.
* It should be readable as plain text by both people and automation.
* It should impose a useful structure (context, options, outcome) without being
  heavy.
* It should be a well-known convention, so the format does not need to be
  explained to every newcomer.

## Considered Options

* Markdown Architectural Decision Records (MADR)
* Nygard-style ADRs (the original short ADR format)
* Keep decisions implicit in pull requests, commits, and chat
* Free-form design documents or a wiki

## Decision Outcome

Chosen option: "Markdown Architectural Decision Records (MADR)", because it
meets all the decision drivers: it is plain Markdown stored in version control,
requires no tooling, provides a well-defined structure (context, drivers,
options, outcome, consequences), and is an established community convention.

### Consequences

* Good, because the reasoning behind each decision is recorded next to the code
  and reviewed like any other change.
* Good, because the format is simple enough to adopt immediately and rigorous
  enough to be useful later.
* Good, because a fresh contributor or agent can read the decisions directory
  and bootstrap quickly.
* Bad, because maintaining ADRs is a small ongoing discipline; decisions made
  without an ADR will drift from the record.
* Bad, because the collection can become noisy if trivial choices are recorded
  as ADRs, so we must exercise judgement about what is "architectural".

### Confirmation

ADRs live in [`docs/decisions/`](./) and are reviewed as part of the pull
request that introduces the corresponding change. A new ADR starts from
[`adr-template.md`](./adr-template.md). The `README.md` contributing section
documents this workflow.

## Pros and Cons of the Options

### Markdown Architectural Decision Records (MADR)

A Markdown template for architectural decisions, maintained at
<https://adr.github.io/madr/>.

* Good, because it is plain Markdown and works with any editor or version
  control system.
* Good, because it provides a rich, optional structure (decision drivers,
  considered options, pros and cons, confirmation).
* Neutral, because it is slightly more verbose than the minimal Nygard format.
* Bad, because nothing enforces that ADRs are actually written.

### Nygard-style ADRs

The original ADR format described by Michael Nygard, using a short
context/decision/consequences structure.

* Good, because it is extremely short and quick to write.
* Good, because it is the format most people mean by "ADR".
* Bad, because it lacks explicit fields for drivers, considered options, and
  their trade-offs, which we expect to be valuable here.

### Keep decisions implicit (pull requests, commits, chat)

* Good, because it requires no extra effort or files.
* Bad, because rationale is scattered and effectively lost over time.

### Free-form design documents or a wiki

* Good, because it allows maximum expressiveness.
* Bad, because it lives outside the repository, requires external tooling, and
  drifts from the code.

## More Information

* [MADR](https://adr.github.io/madr/) — the format used here.
* [Architectural Decision Records](https://adr.github.io/) — background on the
  practice.
* Superseded ADRs are kept and linked rather than deleted, so this directory is
  an append-only history of decisions.
