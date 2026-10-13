# Contract Features _(bp-th-contract-features)_

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

PoC generative AI pipeline to structure and interact with contract documents.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
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

## Install

Prerequisites (no global `bun` or `podman-compose` version assumed):

- [Podman](https://podman.io/) with the `podman-compose` provider
  (`podman compose ...`).
- [Bun](https://bun.sh/) `1.2.23`, pinned once via `packageManager` in
  `package.json`. That pin is the single source of truth; no other
  version files are used.

If `podman compose` cannot reach the engine, the user Podman socket may
need starting first:

```sh
systemctl --user start podman.socket
```

Then install dependencies:

```sh
bun install
```

## Usage

Start the local Inngest dev server (UI at `http://localhost:8288`):

```sh
bun run dev:setup
```

Run the Elysia API with the Inngest serve handler (starts infra first,
then serves on `http://localhost:3000`):

```sh
bun run dev
```

Open `http://localhost:8288` and confirm the `hello-world` function is
listed. Then publish the demo event — `INNGEST_DEV=1` is required for
host commands, otherwise the SDK defaults to cloud mode and the serve
route returns 500s:

```sh
INNGEST_DEV=1 bun run src/send.ts
```

This sends the `demo/hello.world` event, runs the `hello-world`
function (one `say-hello` step returning `Hello local`), and the
completed run appears in the Inngest UI Runs tab. `GET /` returns
`{ ok: true }` as a health check.

Implementation notes: the serve handler at `/api/inngest` uses the
official `inngest/bun` adapter, and the function uses the Inngest v4
`triggers: [{ event: "demo/hello.world" }]` form. The `compose.yaml`
points the dev server at the host API via
`http://host.containers.internal:3000/api/inngest` (Podman networking,
not `localhost` inside the container).

## Project Status

Hello-world loop working. The repository runs a local Elysia API on
`:3000` wired to a local Inngest dev server on `:8288` via Podman
Compose: `src/send.ts` publishes `demo/hello.world` and the
`hello-world` function run is observable in the Inngest UI. Contract
document ingestion itself is still undiscovered — features continue to
be added one at a time from here.

## Architecture Decisions

Significant technical decisions are captured as Architecture Decision Records
(ADRs) in [`docs/decisions/`](docs/decisions/), using the
[MADR](https://adr.github.io/madr/) format.

- [`docs/decisions/adr-template.md`](docs/decisions/adr-template.md) — the
  template to copy when recording a new decision.
- [`docs/decisions/0000-use-markdown-architectural-decision-records.md`](docs/decisions/0000-use-markdown-architectural-decision-records.md)
  — the founding decision to use ADRs at all.
- [`docs/decisions/0001-container-harness-podman-compose.md`](docs/decisions/0001-container-harness-podman-compose.md)
  — Podman + podman-compose as the local container harness.
- [`docs/decisions/0002-web-framework-elysia.md`](docs/decisions/0002-web-framework-elysia.md)
  — Elysia on Bun as the web framework.
- [`docs/decisions/0003-workflow-engine-inngest.md`](docs/decisions/0003-workflow-engine-inngest.md)
  — Inngest as the workflow engine.
- [`docs/decisions/0004-bun-version-and-scripts.md`](docs/decisions/0004-bun-version-and-scripts.md)
  — Bun version pinning and the `dev`/`dev:setup` script contract
  (superseded by ADR-0005).
- [`docs/decisions/0005-bun-version-packagemanager-only.md`](docs/decisions/0005-bun-version-packagemanager-only.md)
  — Bun version pinned once via `packageManager`.

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
