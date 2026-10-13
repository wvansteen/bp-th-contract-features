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

A proof of concept for a small generative AI pipeline that structures
contract documents and lets people interact with them.

The problem space is still open: the documents, the users, and what
"structure and interact" means are all undecided. This repo starts with
scaffolding and a light docs process, and records each decision as it
comes.

Likely stack, not decided (each piece gets an ADR when we reach it):

- Pipeline: [Inngest](https://www.inngest.com/), durable event-driven
  workflow steps.
- Web server: [Elysia](https://elysiajs.com/) on [Bun](https://bun.sh/),
  TypeScript.
- Frontend: [Svelte](https://svelte.dev/) SPA, including the chatbot UI.
- LLM steps: [LangChain](https://js.langchain.com/) for the generative
  parts.

Code is mostly functional, using a managed effects system where it earns
its keep. Logging as a side effect is fine here.

## Install

- A compose daemon. Recommended: [Podman](https://podman.io/).
- [mise](https://mise.jdx.dev/) or [Bun](https://bun.sh/) `1.2.23`
  (pinned via `packageManager` in `package.json`).

```sh
bun install
```

## Usage

```sh
bun run dev:setup  # Inngest dev server, UI at http://localhost:8288
bun run dev        # Elysia API on http://localhost:3000
```

Confirm the `hello-world` function is listed at `http://localhost:8288`,
then publish the demo event (`INNGEST_DEV=1` comes from `.env`):

```sh
bun run src/send.ts
```

The run shows in the Inngest UI. `GET /` returns `{ ok: true }`.

## Project Status

Hello-world loop works: Elysia on `:3000` wired to Inngest on `:8288`
via Podman Compose. Contract ingestion itself is still undiscovered.

## Architecture Decisions

Decisions live as ADRs in [`docs/decisions/`](docs/decisions/)
([MADR](https://adr.github.io/madr/)):

- [`docs/decisions/adr-template.md`](docs/decisions/adr-template.md)
  — copy for new decisions.
- [`docs/decisions/0000-use-markdown-architectural-decision-records.md`](docs/decisions/0000-use-markdown-architectural-decision-records.md)
  — using ADRs at all.
- [`docs/decisions/0001-container-harness-podman-compose.md`](docs/decisions/0001-container-harness-podman-compose.md)
  — Podman Compose as local container harness.
- [`docs/decisions/0002-web-framework-elysia.md`](docs/decisions/0002-web-framework-elysia.md)
  — Elysia on Bun as web framework.
- [`docs/decisions/0003-workflow-engine-inngest.md`](docs/decisions/0003-workflow-engine-inngest.md)
  — Inngest as workflow engine.
- [`docs/decisions/0004-bun-version-and-scripts.md`](docs/decisions/0004-bun-version-and-scripts.md)
  — Bun version pinned via `packageManager`.

Superseded ADRs stay linked, never deleted.

## Contributing

Questions welcome via GitHub Issues; pull requests accepted. Two rules:

1. A choice between real alternatives gets an ADR in `docs/decisions/`
   first.
2. A shipped feature gets a bullet in `CHANGELOG.md` under
   `[Unreleased]`.

Keep changes small; let the ADRs explain the rest.

## License

[MIT](LICENSE) © William Van Steen
