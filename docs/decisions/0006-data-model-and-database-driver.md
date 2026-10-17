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
table one definition shared by the adapter and the migrations. The `metadata`
column stores the Box SDK response verbatim, so `{value}`-wrapped dates and the
`rawData` shadow copy are kept unmodified.

### Consequences

* Good, because `onConflictDoUpdate` on `document_id` is what makes a redelivered
  event idempotent.
* Good, because `drizzle-kit` generates and applies the migration from the same
  schema file.
* Bad, because Drizzle's generic query types are intricate, so the adapter is
  the only place in the codebase that touches them.
* Bad, because each file is sent with the stable event id
  `box/process.file/<fileId>` and Inngest deduplicates that id for 24 hours, so a
  file whose processing exhausts its retries cannot be re-run automatically until
  the window passes (manual replay or wait).

### Confirmation

Task 5's `src/db/document-store.test.ts` runs against a real Postgres. It
creates and migrates a throwaway database, so it never truncates or writes the
developer's `contracts` data, then drops that database. It upserts `documentId`
"1" twice and "2" once and asserts two rows remain with "1" carrying the newest
metadata. A second test re-upserts "1" and asserts `listAll` returns the same
order as before, and that the order is sorted. Run `bun run dev:setup`, then
`bun test src/db/document-store.test.ts`; `podman compose down` cleans up.

## More Information

Revisit if the document count outgrows a single-column primary key, or if
document metadata needs querying rather than listing.
