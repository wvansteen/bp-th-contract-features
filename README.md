# Contract Features _(bp-th-contract-features)_

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

PoC generative AI pipeline to structure and interact with contract documents.

## Table of Contents

- [Background](#background)
- [Project Status](#project-status)
- [Architecture Decisions](#architecture-decisions)
- [Contributing](#contributing)
- [License](#license)

## Background

This repository is a proof of concept. Its goal is to **build and test a small
generative AI pipeline to structure and interact with content from contract
documents**.

We are starting from a state of zero. The problem being solved — what the
contract documents are, who uses them, and what "structure and interact" should
ultimately mean — is still being discovered. Rather than commit to an
implementation prematurely, this repository first establishes the scaffolding
and the lightweight documentation process that will carry those decisions as
they are made.

The stack below is **intended, non-binding context** for how the PoC will
likely be built. It is deliberately *not* recorded as a set of accepted
decisions yet; each piece will be confirmed (or rejected) via an Architecture
Decision Record when we reach it:

- **Pipeline** — [Inngest](https://www.inngest.com/), for durable, event-driven
  workflow steps.
- **Web server** — [Elysia](https://elysiajs.com/), running on
  [Bun](https://bun.sh/) with TypeScript.
- **Frontend** — [Svelte](https://svelte.dev/) single-page app, including the
  chatbot interface for interacting with contract content.
- **LLM steps** — [LangChain](https://js.langchain.com/), for the generative
  parts of the pipeline.

Stylistically, the code aims to be *mostly functional* and to lean on a managed
effects system where it makes sense, with one deliberate exception: **logging is
allowed as a side effect** rather than being fully managed. This is a pragmatic
concession for the PoC, not a permanent rule.

## Project Status

Pre-scaffold. So far this repository contains only documentation and process:
the README, a changelog, an MIT license, and the ADR setup. There is no
application code, package manifest, or build tooling yet. Features will be added
one at a time from here.

## Architecture Decisions

Significant technical decisions are captured as Architecture Decision Records
(ADRs) in [`docs/decisions/`](docs/decisions/), using the
[MADR](https://adr.github.io/madr/) format.

- [`docs/decisions/adr-template.md`](docs/decisions/adr-template.md) — the
  template to copy when recording a new decision.
- [`docs/decisions/0000-use-markdown-architectural-decision-records.md`](docs/decisions/0000-use-markdown-architectural-decision-records.md)
  — the founding decision to use ADRs at all.

To add an ADR, copy `adr-template.md` to `docs/decisions/NNNN-short-title.md`
(use the next free number), fill it in, and set its `status`. Once a decision is
superseded, keep the old ADR and link the replacement rather than deleting
history.

## Contributing

Questions and discussion are welcome via GitHub Issues in this repository, once
a remote is configured. Pull requests are accepted.

This repository is developed decision-first. Two rules apply to every change:

1. **A decision becomes an ADR.** If you choose between meaningful alternatives
   (a library, a data model, a hosting approach), record it in
   `docs/decisions/` before or alongside the code that depends on it.
2. **A feature becomes a changelog entry.** Add a bullet under the matching
   heading in the `[Unreleased]` section of [`CHANGELOG.md`](CHANGELOG.md),
   using one of the Keep a Changelog categories (`Added`, `Changed`,
   `Deprecated`, `Removed`, `Fixed`, `Security`).

Keep changes small and focused. Because this is a PoC, prefer the smallest
change that answers the current question, and let the ADRs explain the rest.

## License

[MIT](LICENSE) © William Van Steen
