# Contract query tool design

Date: 2026-10-19

## Intent

The chat assistant cannot read the ingested contracts; ADR 0009 records that
gap. People ask it questions about the contracts, so it needs a way to read what
the pipeline stored. This adds one tool, `query_contracts`, that lets the model
write SQL against the `documents` table.

This is a PoC. The model writes SQL, a parser checks the statement is a single
read-only query, and the statement runs in a read-only transaction. Production
would sit behind a Postgres role limited to read-only access; that is a README
note, not code here.

## Goals

- Answer questions about stored contracts from the real rows, not from the
  conversation.
- Teach the model the `documents` schema and the smart feature keys, including
  Postgres JSON query syntax for the two jsonb columns.
- Keep the OpenRouter key and the database server-side.

## Non-goals

- Paging, aggregation across thousands of documents, or a query UI.
- Exposing PDF bytes. `document` holds the PDF and is never returned.
- More than one tool.
- A SQL editor, saved queries, or a fixed set of canned queries.

## Constraints

- The repo's lint locks hold: no `let`, no loops, no `any`, no assertions, no
  mutation of variables or properties, including in tests.
- Concrete clients are built in `src/deps.ts` only.
- The browser-facing SSE stream stays text-only. Tool calls never leave the
  server.

## Decisions

- **`pgsql-ast-parser` 12.0.2 (MIT) validates the statement.** Pure JS, two
  small dependencies, and it bundles into the single Vercel function with no
  runtime assets. Rejected: `libpg-query` and `@pgsql/parser`, which embed the
  real parser as WASM but need a `.wasm` file next to the bundled function.
- **Shape check, then a read-only transaction, then a row cap.** The parser
  rejects anything that is not exactly one `select`/`with` statement and rejects
  `insert`, `update`, or `delete` nodes nested in a CTE. Drizzle runs the
  statement under `transaction(..., { accessMode: "read only" })` with a 5
  second statement timeout. Results are capped at 100 rows.
- **The parser is not complete.** `WITH RECURSIVE` and some inserts do not
  parse. A valid query can be rejected; the parse error goes back to the model
  as the tool result so it can rewrite.
- **`query_contracts` takes one string argument, `sql`.** Results come back as
  `{"rows": [...], "truncated": bool}`. Errors come back as `{"error": "..."}`
  so the model can correct itself.
- **The agent loop runs at most three tool rounds**, then one final round with
  no tools so the reply ends in prose.

## Left to the builder

The tool description copy is pinned in the plan. Error wording outside the
pinned strings is the builder's.
