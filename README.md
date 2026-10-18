# Contract Features _(bp-th-contract-features)_

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

PoC generative AI pipeline to structure and interact with contract documents.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Development](#development)
- [Architecture Decisions](#architecture-decisions)
- [License](#license)

## Background

A proof of concept for a small generative AI pipeline that structures contract
documents and lets people interact with them.

## Install

- [Podman](https://podman.io/) for the Inngest dev server and Postgres.
- [Bun](https://bun.sh/) `1.2.23` (pinned in `package.json`).
- [Ollama](https://ollama.com/) running locally with a model pulled
  (`ollama pull llama3.2`).

```sh
bun install
```

Copy `.env.example` to `.env` and fill in `BOX_APP_TOKEN` and `BOX_FOLDER_ID`.
The dev tasks inject `DATABASE_URL` from the stack's published port, so no
connection string is stored.

## Usage

```sh
mise run dev:setup     # start the stack; prints the Inngest UI and Postgres URLs
mise run dev           # Elysia API on an auto-selected port, printed at startup
mise run dev:teardown  # stop the stack
```

Nothing binds a fixed port: Podman assigns the Inngest dev server's and
Postgres's host ports, and the app asks the OS for one, so every workspace gets
its own and several can run at the same time. The dev tasks read the stack's
addresses straight from Podman and pass them to the app process, so no ports are
written down anywhere; `mise run dev:setup` prints the Inngest UI and Postgres
URLs, and `mise run db:migrate` applies migrations to the running database.
End-to-end checks read the app's port from its startup output
(`Elysia listening on http://...:<port>`) to build their curl commands.

Once the app is up, the `dev` task reads its port from the startup output and
registers the functions with the Inngest dev server over the documented `PUT`
sync (SDK spec 4.3.1), pointing Inngest at `host.containers.internal:<port>`
(the URL the Inngest container calls back at). To re-register on demand (for
example after the dev server is recreated), send the same request:

```sh
curl -X PUT http://host.containers.internal:<port>/api/inngest \
  --resolve host.containers.internal:<port>:127.0.0.1
```

Trigger an ingest run:

```sh
curl -X POST http://localhost:<port>/process-contracts \
  -H "Content-Type: application/json" \
  -d '{"maxDocuments": 10}'
```

List stored document metadata:

```sh
curl http://localhost:<port>/contracts
```

- `GET /` serves the Lake County, Illinois branded `Contract Investigation`
  page, with the chat embedded as a bottom-right assistant that streams replies
  from a local [Ollama](https://ollama.com/) model; `/chat` redirects to `/`.

The page carries the chat's Ollama settings in `public/index.html`; nothing
server-side reads Ollama environment variables.

## Development

```sh
bun run format:check  # Prettier, read-only
bun run lint          # ESLint locks
bun run typecheck     # tsc --noEmit
bun run build         # bundle to dist/
```

The pre-commit hook runs all four and rejects the commit on failure.

`mise run` covers the workspace side: the local stack and its wiring. `bun run`
covers the project side. A mise task may call `bun run`, never the other way
round, so the gates work on a fresh clone with nothing but `bun install`.

## Architecture Decisions

ADRs live in [`docs/decisions/`](docs/decisions/).

## License

[MIT](LICENSE) © William Van Steen
