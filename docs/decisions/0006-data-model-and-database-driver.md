---
status: accepted
date: 2026-10-17
decision-makers: William Van Steen
---

# Data model and database driver

## Context and Problem Statement

The pipeline stores one row per document: an id and whatever metadata Box
returns. The ingest path is at-least-once, so re-processing a file must not
create a second row. Access goes through a narrow `DocumentStore` port so the
handlers stay testable without a database.

## Decision Drivers

* A conflict-safe upsert, since ingest is at-least-once and a file can be
  processed more than once
* One schema definition shared by the adapter and the migrations
* Tests that do not need a database

## Considered Options

* Drizzle ORM with postgres.js
* Drizzle ORM with node-postgres
* Raw SQL with postgres.js and no query builder

## Decision Outcome

Chosen option: "Drizzle ORM with postgres.js", because the conflict-safe upsert
the design depends on is expressed directly as
`onConflictDoUpdate({ target, set })`, and a typed schema gives the `documents`
table one definition shared by the adapter and the migrations.

### Consequences

* Good, because `onConflictDoUpdate` on `document_id` is what makes a redelivered
  event idempotent.
* Good, because `drizzle-kit` generates and applies the migration from the same
  schema file.
* Bad, because Drizzle's generic query types are intricate, so the adapter is
  the only place in the codebase that touches them.

### Confirmation

`src/db/document-store.test.ts` upserts the same `documentId` three times
against a real Postgres and asserts one row remains with the latest metadata.
Run it with `bun test src/db/document-store.test.ts`.
