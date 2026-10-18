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

- A conflict-safe upsert, since ingest is at-least-once and a file can be
  processed more than once
- One schema definition shared by the adapter and the migrations
- Tests that do not need a database

## Considered Options

- Drizzle ORM with postgres.js
- Drizzle ORM with node-postgres
- Raw SQL with postgres.js and no query builder

## Decision Outcome

Chosen option: "Drizzle ORM with postgres.js", because the conflict-safe upsert
the design depends on is expressed directly as
`onConflictDoUpdate({ target, set })`, and a typed schema gives the `documents`
table one definition shared by the adapter and the migrations. The `metadata`
column stores the Box SDK response verbatim, so `{value}`-wrapped dates and the
`rawData` shadow copy are kept unmodified.

### Consequences

- Good, because `onConflictDoUpdate` on `document_id` is what makes a
  redelivered event idempotent.
- Good, because `drizzle-kit` generates and applies the migration from the same
  schema file.
- Bad, because Drizzle's generic query types are intricate, so the adapter is
  the only place in the codebase that touches them.
- Bad, because each file is sent with the stable event id
  `box/process.file/<fileId>` and Inngest deduplicates that id for 24 hours, so
  a file whose processing exhausts its retries cannot be re-run automatically
  until the window passes (manual replay or wait).

### Confirmation

The `document_id` primary key the conflict-safe upsert targets is present in the
generated migration. Confirmed by this command, which exits non-zero if the
column or its primary key is dropped:

```sh
grep -q '"document_id" text PRIMARY KEY' drizzle/0000_narrow_saracen.sql
```

The live check is the manual smoke: after `mise run dev:setup` and
`mise run db:migrate`, `POST /process-contracts` followed by `GET /contracts`
returns the ingested rows. The deleted `document-store.test.ts` was the only
automated coverage of the upsert; the accepted gap is recorded in the refactor
spec.

## More Information

Revisit if the document count outgrows a single-column primary key, or if
document metadata needs querying rather than listing.
