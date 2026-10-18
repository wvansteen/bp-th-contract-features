# Test strategy and functional refactor

Date: 2026-10-17. Branch `feat/process-documents` (PR #5). Status: draft for
approval.

## Intent and why

The contract ingest pipeline works but does not meet the human's code
standards. Since that review, `main` carries the standard itself: the hard
locks in `AGENTS.md` `## Style`, `docs/guidelines/functional-typescript.md` for
judgement calls, an ESLint + Prettier + typecheck + build pre-commit gate, and
mise-managed dev tooling. The code on this branch violates the locks and its
tests violate the testing taxonomy the human wants.

This work brings the branch up to the standard and fixes test organization.

The full lock-violation inventory this covers: the `while` loop with
accumulators in `src/functions/list-files.ts`; the `as unknown as` step narrows
in `src/inngest.ts`; `as` casts in `src/box/client.ts:41`,
`src/db/document-store.ts:40`, and `src/functions/process-file.test.ts:142`;
the Ctrl-C cleanup block in `src/index.ts` (lines 26-48: `let shuttingDown`,
an assignment, `process.exitCode = 1`); and statement/loop style that the
guidelines judge rather than lock. No commit can pass the pre-commit gate
until every one of these is resolved.

## Goals

1. `AGENTS.md` gains a `## Testing` section encoding the taxonomy (see
   Decisions).
2. Test surgery: remove the tests the taxonomy excludes; keep exactly the
   tests it wants; no mocks or spies anywhere.
3. Every touched file (`src/**`, remaining tests) passes the full gate:
   `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run build`,
   and `bun run test` green.
4. Integration: the branch rebased onto `origin/main` (`11a3020`), our ADRs
   renumbered to 0008 and 0009, docs consistent with the mise-based workflow
   and auto-assigned ports.

## Non-goals

- Component tests. Decided out of scope by the human: this is a PoC and no
  more time goes into scaffolding. The taxonomy documents where they would
  live (`tests/`) when they ever return.
- New features, behavior changes to the pipeline beyond the shutdown deletion,
  CI, or changes to the pre-commit gate `main` already owns.
- Renumbering `main`'s ADRs (its own duplicate 0006s stay as merged history).

## Anti-goals

- Tests written for the sake of tests. A test earns its place by pinning
  behavior a reader could otherwise get wrong.
- Mocks, spies, mock libraries, `spyOn`, or stubs that record interactions by
  mutating state.
- `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, non-null assertions, or
  type assertions used to silence the locks.
- Keeping loops or accumulators and working around the linter.

## Constraints (from the human)

- Unit tests exercise pure functions. Not small files that only integrate with
  a library or external system. Env-var collection is the given example of what
  not to test.
- Test doubles are stub objects that satisfy the type system and slot in as
  parameters. IoC makes mocks and spies unnecessary.
- Component tests are end to end through the public contract (the API) in a
  dedicated `tests/` directory. Out of scope for this work.
- `docs/guidelines/functional-typescript.md` is the full standard for the
  refactor. The lint config is the floor.
- Our ADRs become 0008 and 0009.
- `db:generate` and `db:migrate` stay in `package.json`: they are deployable
  project commands and deployment calls `db:migrate`. `mise.toml` is for the
  local environment only.

## Decisions (the human's answers)

- Keep `list-files.test.ts` and `process-file.test.ts` as unit tests; the
  handlers are pure functions over injected ports.
- Delete `env.test.ts`, `document-store.test.ts`, `contracts.test.ts`.
  Component tests are out of scope, so their coverage is dropped, not moved.
  The accepted gaps are listed below.
- Box is not part of any automated suite. Live Box verification stays a manual
  smoke run.
- Delete the Ctrl-C cleanup block in `src/index.ts` (lines 26-48) outright.
  The process terminates with Node's default on SIGINT/SIGTERM; in-flight
  requests may reach a closing pool. Accepted twice, with the full file shown.
- Delete the `dev:send` mise task and its README Usage line with `src/send.ts`.
- ADR renumber: ours to 0008 (Box auth) and 0009 (data model).

## How (controller's calls, marked as such)

- **Toolchain baseline: `main`'s wins.** `typescript` `~6.0.3`,
  `@types/bun` `~1.2.23`, and `main`'s `tsconfig.json`
  (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, ...) are the gate the
  human validated. The branch's older pins and looser options drop. If the
  gate proves a genuine need (for example `lib: DOM`), add the minimal option
  with a comment. The stricter checks feed into the refactor's budget: kept
  tests index like `sent[0].id` and the unfold will be checked under
  `noUncheckedIndexedAccess`.
- **Rebase first, then refactor.** Doc merge rule: branch content with `main`'s
  formatting (Prettier rewrap). `main`'s plan and spec copies are pre-review
  snapshots (they still say `rateLimit`, `ADR-0005`, "(Inngest, verified)"),
  so a hunk-wise merge would re-introduce defects this branch already fixed.
  Our deletion of `hello.ts` and `send.ts` wins over `main`'s edit of
  `hello.ts`; the `dev:send` task and README line go with them. `main`'s
  mise-based usage docs are the base and our API endpoints fold in, with every
  URL port-agnostic (the app listens on an auto-assigned port like `main`'s;
  docs read the port from startup output). ADR files renumber to 0008/0009
  and every reference follows, including ADR confirmations that today cite
  fixed ports or the old Task 7 procedure.
- **Effect traces instead of recording stubs.** The locks ban mutation in test
  code too (`eslint.config.ts` has no test override), so stubs cannot record
  calls into shared arrays. Handlers therefore return a value describing what
  they did (events emitted, pages walked, document upserted) and tests assert
  on that return against pure typed stubs with canned results. Interaction
  count assertions (e.g. "fetched exactly once") are dropped: they test
  Inngest's memoization contract, not our code. The steps contract stays
  documented.
- **Structural error guard.** `process-file`'s `instanceof BoxApiError` check
  is replaced by a guard over the error's data (`responseInfo.statusCode` and
  the `retry-after` header). This satisfies the locks (no `as`), matches the
  guidelines (discriminate on data), and makes error values stubbable without
  constructing SDK class instances.
- **The pagination walk becomes a functional unfold** over page results: no
  loop, no accumulators, step IDs still `page-<offset>` / `emit-<offset>`, and
  the re-entry determinism invariant (state derived only from step results) is
  preserved and still tested.
- **Statements stay where they read better.** Early `return` and `try/catch`
  are not lock violations; the guidelines say statements are not banned
  outright. The target is the locked constructs plus the guidelines' judgement.
- **Scripts.** `bun run test` (unit suite only) joins `package.json`.
  `db:generate` and `db:migrate` stay in `package.json` per the human. The
  pre-commit gate is left exactly as `main` ships it (format:check, lint,
  typecheck, build).
- **AGENTS.md testing text** goes in a `## Testing` section near `## Style`,
  stating the taxonomy, the stub rule (no mocks or spies, typed stub objects),
  the component-test home and its out-of-scope status, and the coverage gaps
  below.

## Accepted coverage gaps (the human's taxonomy, made explicit)

Deleting the three test files drops automated coverage of: env validation
error messages, the Drizzle upsert conflict behavior and `document_id`
ordering, and route behavior (201, 422 validation shapes, `GET /contracts`
body). Deleting the shutdown block drops the drain-before-close behavior. All
are covered today only by the manual end-to-end run and would return with a
future component suite.

## What's left to the builder

Exact shapes for the effect traces and stubs, the unfold implementation and
its test cases, the guard's TypeScript narrowing, and the task breakdown into
commits. Everything above binds those choices.
