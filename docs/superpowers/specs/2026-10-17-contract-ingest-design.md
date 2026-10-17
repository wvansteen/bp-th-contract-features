# Contract Ingest Pipeline — Design Spec

**Date:** 2026-10-17 **Status:** Approved

## Intent

Build a pipeline that loads contract documents from a Box folder, processes
their metadata asynchronously via Inngest, stores it in Postgres, and serves it
via an API.

## Goals

- List files from a Box folder and process each file's metadata
- Store document metadata in Postgres with a simple 2-column schema
- Expose an endpoint to trigger ingest and an endpoint to list all metadata
- Handle pagination across Box folder items
- Respect Box API rate limits

## Non-Goals

- File content download (metadata only)
- User authentication on the endpoints
- Filtering or querying the document list
- Production-grade Box auth (JWT/CCG)
- Recursing into subfolders (they are skipped, not traversed)

## Architecture

### Endpoints

- `POST /process-contracts` — takes `{ maxDocuments: number }`, sends a
  `box/list.files` Inngest event, returns `201`. The body is validated by the
  framework, which rejects out-of-range values with `422`; the handler has no
  error branch.
- `GET /contracts` — returns all stored documents as
  `[{ documentId, metadata }]`.

### Event Flow

One `box/list.files` run pages through the whole folder itself. It does not emit
an event to continue.

```
POST /process-contracts → send "box/list.files" { maxDocuments }

box/list-files (single run, loops pages internally):
  - offset = 0, processed = 0
  - while processed < maxDocuments:
      - step.run "page-<offset>": GET /folders/<folderId>/items (offset, limit=100)
      - keep only entries where type == "file"  (folders and web links are skipped)
      - take up to (maxDocuments - processed) of them
      - step.sendEvent "emit-<offset>": one "box/process.file" per file,
        each with id "box/process.file/<fileId>"
      - processed += emitted; stop if the cap was hit mid-page
      - stop if offset + limit >= totalCount; otherwise offset += limit

box/process-file:
  - step.run "describe-file": GET /files/:id (full metadata)
  - step.run "upsert": upsert { document_id, metadata } into Postgres
```

`processed` and `offset` are local to the run. No counter is carried in an event
payload.

### Delivery Semantics

At-least-once, held correct by three independent layers:

1. `step.sendEvent` is a durable step, so a retried run does not re-send a page
   whose send already succeeded.
2. Every emitted event carries a stable `id`, so Inngest does not start a second
   run for the same file within its 24-hour dedup window.
3. `process-file` only ever upserts, which is conflict-safe on `document_id`.

No layer is relied on alone; a failed `sendEvent` batch may partially succeed.

Events are emitted from the run body, not from inside a `step.run`, because
steps cannot be nested.

### Dependency Injection

All dependencies are built once in a single composition root module
(`src/deps.ts`) and injected explicitly:

- `env` loaded once via `loadEnv()`
- `boxClient` created via `createBoxClient({ token })`
- `db` created via `createDbClient(databaseUrl)` and wrapped in a
  `DocumentStore`
- Inngest functions and Elysia routes import from `src/deps.ts` and receive what
  they need as parameters

Exactly one Postgres pool and one Box client exist per process. The pool is
closed on shutdown.

Handlers depend on narrow structural types — `BoxClientPort` and `DocumentStore`
— so tests supply plain fakes and the vendor SDK stays behind one adapter.
`DocumentStore` exposes no insert path, which is what makes redelivery safe.

No global context, no service locators, no env vars accessed inside functions.

The only other env access is `drizzle.config.ts`, a CLI-only file that the
running app never imports.

### Box API Client

`createBoxClient({ token })` wraps the official `box-node-sdk` and returns:

- `listFiles({ folderId, offset, limit })` → `{ entries, totalCount }`
- `describeFile({ fileId })` → full file metadata

Auth and URL building are the SDK's job and are not reimplemented. The SDK's
own retry policy does not read the `Retry-After` header, so honoring Box's
header is our job (see Rate Limiting). The adapter only narrows the response
types. Note the SDK camel-cases the REST response, so `total_count` is
`totalCount`.

The folder id comes from `BOX_FOLDER_ID` and is injected; no function hardcodes
it.

### Database

Table `documents`:

- `document_id` (text, primary key)
- `metadata` (jsonb, not null)

### Rate Limiting

- `list-files` function: `concurrency: { limit: 1 }`, no rate limit (runs rarely)
- `process-file` function: `concurrency: { limit: 1 }`, `throttle: { limit: 1000, period: "1m" }`

`throttle` rather than `rateLimit`, because they differ in what happens at the
limit. `rateLimit` is lossy: Inngest skips runs once the limit is hit. `throttle`
enqueues them. A document must never be dropped, so the queueing behavior is the
one wanted here.

Box's own limit is honored by `process-file`'s describe step. When Box returns
`429`, `process-file` raises Inngest's `RetryAfterError` with the wait parsed
from the `Retry-After` header: the delta-seconds Box sent, with a 60-second
fallback when the header is an HTTP-date. A `404` raises
`NonRetriableError` — a deleted or moved file will not reappear, so retrying
would burn attempts and leave a permanently red run.

No ceiling is asserted here; the SDK and Box's published limits are the source
of truth.

### Platform Limits

Inngest's published usage limits include 1,000 steps per function run and
5,000 events per `sendEvent` call. They are server-side limits, not enforced by
the SDK or the local dev server. `list-files` spends 2 steps per page of 100,
so the step ceiling is never the binding constraint here: `maxDocuments` is
capped at 1000 by request validation to bound one run's fan-out and cost.

## Tech Stack

- TypeScript on Bun
- Elysia for HTTP
- Inngest v4 for event processing
- `box-node-sdk` v10 for the Box API
- Drizzle ORM + postgres.js for database
- Postgres 16

ADR-0006 records the Box authentication method and ADR-0007 the data model and
database driver.

## Auth

Box API developer token (see ADR-0006). Passed as `BOX_APP_TOKEN` env var.
