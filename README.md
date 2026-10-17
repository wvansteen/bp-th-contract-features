# Contract Features _(bp-th-contract-features)_

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

PoC generative AI pipeline to structure and interact with contract documents.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Architecture Decisions](#architecture-decisions)
- [License](#license)

## Background

A proof of concept for a small generative AI pipeline that structures contract
documents and lets people interact with them.

## Install

- [Podman](https://podman.io/) for the Inngest dev server.
- [Bun](https://bun.sh/) `1.2.23` (pinned in `package.json`).
- [Ollama](https://ollama.com/) running locally with a model pulled
  (`ollama pull llama3.2`).

```sh
bun install
```

## Usage

```sh
mise run dev:setup     # start the stack; prints the Inngest UI URL
mise run dev           # Elysia API on an auto-selected port, printed at startup
mise run dev:send      # send the demo event
mise run dev:teardown  # stop the stack
```

Nothing binds a fixed port: Podman assigns the Inngest dev server's
ports and the app asks the OS for one, so every workspace gets its own
and several can run at the same time. The dev tasks read the stack's
addresses straight from Podman and pass them to the app process, so no
ports are written down anywhere. End-to-end checks read the app's port
from its startup output (`Elysia listening on http://...:<port>`) to
build their curl commands.

Once the app is up, the `dev` task reads its port from the startup
output and registers the functions with the Inngest dev server over
the documented `PUT` sync (SDK spec 4.3.1), pointing Inngest at
`host.containers.internal:<port>` (the URL the Inngest container
calls back at). To re-register on demand (for example after the dev
server is recreated), send the same request:

```sh
curl -X PUT http://host.containers.internal:<port>/api/inngest \
  --resolve host.containers.internal:<port>:127.0.0.1
```

- `GET /` returns `{ ok: true }`.
- `GET /chat` serves a chat page that streams replies from a local
  [Ollama](https://ollama.com/) model.

The chat page carries its Ollama settings in `public/index.html`; nothing
server-side reads Ollama environment variables.

## Architecture Decisions

ADRs live in [`docs/decisions/`](docs/decisions/).

## License

[MIT](LICENSE) © William Van Steen
