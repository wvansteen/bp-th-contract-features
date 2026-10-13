# Contract Features _(bp-th-contract-features)_

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

PoC generative AI pipeline to structure and interact with contract documents.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Architecture Decisions](#architecture-decisions)
- [Contributing](#contributing)
- [License](#license)

## Background

A proof of concept for a small generative AI pipeline that structures
contract documents and lets people interact with them.

## Install

- [Podman](https://podman.io/) for the Inngest dev server.
- [Bun](https://bun.sh/) `1.2.23` (pinned in `package.json`).

```sh
bun install
```

## Usage

```sh
bun run dev:setup  # Inngest dev server, UI at http://localhost:8288
bun run dev        # Elysia API on http://localhost:3000
```

```sh
bun run src/send.ts
```

`GET /` returns `{ ok: true }`.

## Architecture Decisions

ADRs live in [`docs/decisions/`](docs/decisions/).

## License

[MIT](LICENSE) © William Van Steen
