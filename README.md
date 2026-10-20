# Contract Features _(bp-th-contract-features)_

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

PoC generative AI pipeline to structure and interact with contract documents.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Development](#development)
- [Deployment](#deployment)
- [Architecture Decisions](#architecture-decisions)
- [License](#license)

## Background

A proof of concept for a small generative AI pipeline that structures contract
documents and lets people interact with them. Processing stores each document's
PDF and classifies it against the smart features with one model call per
feature.

## Install

- [Podman](https://podman.io/) for the Inngest dev server and Postgres.
- [Bun](https://bun.sh/) `1.2.23` (pinned in `package.json`).

```sh
bun install
```

Copy `.env.example` to `.env` and fill in the two Box values. Leave the database
names empty locally: the dev tasks inject them, and production sets them in the
Vercel project environment.

- `BOX_APP_TOKEN` and `BOX_FOLDER_ID` come from your Box app and the folder to
  ingest from.
- `DATABASE_URL` is the app's Postgres URL. The local dev tasks inject it from
  the stack's published port, so no connection string is stored.
- `DATABASE_URL_UNPOOLED` is the URL migrations run against. The local
  `db:migrate` task injects the same stack URL. For production, set both
  database names in the Vercel project environment: the pooled Neon URL as
  `DATABASE_URL` and the unpooled one as `DATABASE_URL_UNPOOLED`.
- `OPENROUTER_API_KEY`, `SMART_FEATURE_MODEL`, and `CHAT_MODEL`.

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

List stored document metadata and smart feature results:

```sh
curl http://localhost:<port>/contracts
```

- `GET /` serves the Lake County, Illinois branded `Contract Investigation`
  page, with the chat embedded as a bottom-right assistant that streams replies
  from a hosted model through the app's `/api/chat` endpoint.

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

## Deployment

The Vercel project is git-connected, with `main` as the production branch.
`vercel.json` selects the Bun runtime and sets
`bun run build && bun run db:migrate` as the build command, so the app ships as
one bundled function and migrations run against `DATABASE_URL_UNPOOLED` before
traffic arrives. Set `VERCEL_EXPERIMENTAL_BACKENDS=1` in the project
environment: it makes Vercel use the bundled function, which avoids the Bun
runtime's module-resolution crash, and emits `public/` as static output. The
build has a separate asset entrypoint, so the page, stylesheet, and Deep Chat
bundle are emitted into `public/` without the Vercel builder parsing them as
code. Elysia's static plugin serves that folder, including `index.html` at `/`.

The build step needs the project environment set first: `DATABASE_URL` (pooled
Neon), `DATABASE_URL_UNPOOLED`, `BOX_APP_TOKEN`, `BOX_FOLDER_ID`, and the
Inngest keys. After the first deploy, sync Inngest against the deployed host:

```sh
curl -X PUT https://<host>/api/inngest
```

## Architecture Decisions

ADRs live in [`docs/decisions/`](docs/decisions/).

## License

[MIT](LICENSE) © William Van Steen
