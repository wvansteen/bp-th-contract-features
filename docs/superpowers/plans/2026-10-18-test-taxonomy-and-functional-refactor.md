# Test Taxonomy and Functional Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the contract ingest branch's code and unit tests meet the repo
standards so it can merge: mutation-free code, unit tests over pure functions
with no mocks or spies, and no component tests.

**Architecture:** One gate-green commit rewrites the two handlers as pure
functions over `unknown`-typed step ports with type-guard narrowing, returns
effect traces so tests can assert behavior, replaces the pagination loop with a
recursion, and rewrites both surviving test files against typed stub objects.
The remaining lock violations and the two regressions the rebase left behind are
fixed in the same commit: the pre-commit gate runs the whole repo, so no
intermediate commit can pass it.

**Tech Stack:** TypeScript on Bun, ESLint (`eslint-plugin-functional` +
typescript-eslint), Prettier, husky, inngest 4.x, box-node-sdk 10, Drizzle,
Elysia.

**Spec:**
`docs/superpowers/specs/2026-10-17-test-strategy-and-functional-refactor-design.md`

## Global Constraints

- Mutation is prohibited in code we write: no `let`/`var`; no assignment to
  variables, parameters, or object properties; no `for`/`while`/`do` loops; no
  `any` or unsafe casts; no `eslint-disable`, `@ts-ignore`, `@ts-expect-error`,
  or non-null `!`. `docs/guidelines/functional-typescript.md` is the standard;
  the lint config is the floor.
- Unit tests exercise pure functions. A test earns its place by pinning behavior
  a reader could otherwise get wrong, never the implementation's call pattern.
- No mocks and no spies. The only test double is a typed stub object that
  satisfies the type system and slots in as a parameter. Handlers expose what
  they did by returning it (an effect trace), and tests assert on that return.
  No stub records calls by mutating state.
- Component (end-to-end) tests are out of scope. The three excluded test files
  are deleted and their coverage is dropped, not moved. Unit tests live beside
  the code as `*.test.ts` and run with `bun test`.
- Toolchain baseline is `main`'s: `typescript` `~6.0.3`, `@types/bun` `~1.2.23`,
  and `main`'s `tsconfig.json`. Add a compiler or lint option only if the gate
  proves a need, with a comment.
- `bun.lock` is only ever produced by `bun install`.
- Every NEW commit passes `bun run format:check`, `bun run lint`,
  `bun run typecheck`, and `bun run build` (the pre-commit hook runs all four).
  No `--no-verify`. This is why the rewrite lands as one commit.

## Non-goals

- Re-running or redoing the rebase; it is done.
- The `AGENTS.md` `## Testing` section, the ADR renumber to 0008/0009, and the
  `dev:send` mise task removal the design doc also lists. Out of scope here.
  (Post-review note: the final whole-branch review ruled the ADR renumber and
  the `dev:send` removal back in as merge blockers and the fix wave landed them;
  only the `AGENTS.md` `## Testing` section remains undone.)
- New features, CI, or changes to the pre-commit gate.

## Review Focus

1. Re-entry determinism after the loop rewrite: step IDs stay `page-<offset>` /
   `emit-<offset>`, and every piece of walk state derives from step results
   only. Pinned by the replay test in Task 1.
2. Error mapping parity after the guard rewrite: 404 non-retriable, 429 with
   delta-seconds multiplied to ms, 429 with an HTTP-date backed off 60s, a bare
   429 rethrown, anything else rethrown. Pinned by four tests in Task 1.
3. `maxDocuments` caps across pages, not per page; the last page survives a
   `totalCount` that is not a multiple of the page size; empty folders and
   non-file entries emit nothing.
4. Gate integrity: zero escapes anywhere (tests included), and the effect traces
   cost nothing at runtime beyond an object return.
5. Behavior over implementation: assertions land on returned traces against
   typed stubs, never on call counts or recorded interactions. The two rebase
   regressions stay fixed: contracts routes wired in `src/index.ts`, and
   `drizzle.config.ts` inside the lint project.

---

### Task 1: Gate-green rewrite of code and unit tests

**Files:**

- Modify: `src/functions/list-files.ts`, `src/functions/list-files.test.ts`
- Modify: `src/functions/process-file.ts`, `src/functions/process-file.test.ts`
- Modify: `src/box/client.ts`, `src/db/document-store.ts`, `src/db/schema.ts`,
  `src/inngest.ts`, `src/index.ts`
- Modify: `tsconfig.json` (one line)
- Delete: `src/config/env.test.ts`, `src/db/document-store.test.ts`,
  `src/routes/contracts.test.ts`
- Modify (formatting only, via `bun run format`): any remaining file
- Create:
  `docs/superpowers/plans/2026-10-18-test-taxonomy-and-functional-refactor.md`
  (this plan; it is committed at the end)

**Interfaces:**

- Consumes: `BoxClientPort`, `BoxPage`, `BoxFileEntry` (`src/box/client.ts`),
  `DocumentStore`, `StoredDocument` (`src/db/document-store.ts`)
- Produces (the contracts the tests assert against):
  - `listFilesHandler(box: BoxClientPort, steps: ListFilesSteps, params: { folderId: string; maxDocuments: number }): Promise<ListFilesResult>`
  - `ListFilesResult = { pagesFetched: readonly number[]; emitted: readonly SentEvent[] }`
  - `ListFilesSteps = { run(id: string, fn: () => Promise<unknown>): Promise<unknown>; sendEvent(id: string, events: SentEvent[]): Promise<unknown> }`
    (the SDK's `sendEvent` payload type rejects `readonly`, so the port is
    relaxed per Step 5's allowance)
  - `processFileHandler(box: BoxClientPort, steps: ProcessFileSteps, store: DocumentStore, params: { fileId: string }): Promise<ProcessFileResult>`
  - `ProcessFileResult = { documentId: string; metadata: Record<string, unknown>; upserted: StoredDocument }`
    (`upserted` is the document handed to `store.upsert`: the design's "document
    upserted" effect-trace fact, so the write is observable from the return)
  - `ProcessFileSteps = { run(id: string, fn: () => Promise<unknown>): Promise<unknown> }`
  - `SentEvent = { id: string; name: string; data: { fileId: string } }`
    (unchanged)

- [ ] **Step 1: Rewrite `list-files.test.ts` first (TDD, red)**

Stubs are plain objects with canned returns, built by pure lookup (for example a
`Record<number, BoxPage>` keyed by offset). No arrays that accumulate, no `let`,
no spies. Async stub methods return `Promise.resolve(...)` of canned data
instead of declaring `async` without awaiting. Tests assert on
`ListFilesResult`:

- `emits one box/process.file per file on a single page`: `result.emitted` maps
  to fileIds `["1","2"]`, all `name === "box/process.file"`.
- `gives every event a stable id`:
  `result.emitted[0].id === "box/process.file/7"`.
- `caps total processed files across pages, not per page`: with
  `maxDocuments: 3` over three pages, `result.emitted` is `["1","2","3"]`.
- `stops fetching once the cap is reached`: with pages of 100 files,
  `totalCount: 400`, and `maxDocuments: 100`, `result.pagesFetched` is `[0]` and
  `result.emitted.length` is 100. The cap stops the walk before the next fetch,
  not after it.
- `walks every page when the folder is larger than one page`:
  `result.pagesFetched` is `[0,100,200]`.
- `stops correctly when totalCount is not a multiple of page size`:
  `pagesFetched` is `[0,100]` for `totalCount: 101`.
- `emits nothing and does not hang for an empty folder`: `result.emitted` is
  `[]`, `pagesFetched` is `[0]`.
- `filters out folders and web links`: only the `type: "file"` entry is emitted.
- `rebuilds the walk from memoized step results`: a `steps.run` stub that
  returns canned results for `page-0`/`emit-0` and throws for `page-100` on the
  first call; the handler rejects. A second call with all ids canned returns the
  full walk (`pagesFetched [0,100,200]`, five events). This is the replay
  determinism test; there is no fetch-count assertion.

Indexing under `noUncheckedIndexedAccess` must typecheck without non-null
assertions; use optional chaining or map-based extraction.

Run: `bun test src/functions/list-files.test.ts` Expected: FAIL (the returned
shape does not exist yet).

- [ ] **Step 2: Rewrite `list-files.ts`**

`listFilesHandler` becomes a recursion (no loop, no mutable accumulators): a
helper takes `(offset, processed, pages, emitted)` and returns
`ListFilesResult`, advancing with `offset + PAGE_SIZE` and
`processed + batch.length` as arguments. The walk's entry condition is the cap
itself: when `processed >= maxDocuments`, return the accumulated result without
fetching, mirroring the pre-rewrite `while (processed < maxDocuments)` guard.
Constants stay `PAGE_SIZE = 100` and the existing step IDs (`page-${offset}`,
`emit-${offset}`) and event shape (`id: "box/process.file/${file.id}"`).
`steps.run` results are validated with an
`isBoxPage(value: unknown): value is BoxPage` guard that throws on shape
mismatch. Preserve: `type === "file"` filtering, the across-pages cap, the
`batch.length < files.length` early stop, and the
`offset + PAGE_SIZE >= page.totalCount` last-page stop. `pagesFetched` records
each fetched offset; `emitted` records each event sent. `ListFilesSteps.run` and
`sendEvent` move to `Promise<unknown>` returns so the real step object satisfies
them without assertions.

Run: `bun test src/functions/list-files.test.ts` Expected: PASS.

- [ ] **Step 3: Rewrite `process-file.test.ts` (TDD, red)**

Same stub discipline. The Box stub `describeFile` throws plain objects shaped
`{ responseInfo: { statusCode, headers } }` (no SDK class construction). Tests:

- `describes the file and upserts it`: the event carries `fileId: "123"` while
  the described file's own id differs (`"777"`), so keying on the wrong id
  cannot pass by accident. `result.documentId === "123"`,
  `result.metadata.name === "contract.pdf"`, and `result.upserted` is
  `{ documentId: "123", metadata: result.metadata }`.
- `passes a 404 through as non-retriable`: thrown error is
  `instanceof NonRetriableError`.
- `passes a 429 Retry-After of seconds through as seconds`: thrown error is
  `instanceof RetryAfterError` with `retryAfter === "120"`. The SDK stores the
  wait as a string of seconds (`RetryAfterError.cjs` rounds ms to seconds), so
  the handler's ms multiplication is what makes this `"120"` rather than `"1"`.
- `falls back to a 60s wait when Retry-After is an HTTP-date`:
  `retryAfter === "60"`.
- `rethrows a 429 that carries no Retry-After`: the original error surfaces.
- `treats an empty Retry-After header as absent`: a `Retry-After: ""` header
  surfaces the original error, the same bare-429 path.
- `rethrows failures that are not Box API errors`: a `TypeError` surfaces.

Run: `bun test src/functions/process-file.test.ts` Expected: FAIL.

- [ ] **Step 4: Rewrite `process-file.ts` and drop the cast in
      `src/box/client.ts`**

Replace `instanceof BoxApiError` with
`isBoxApiFailure(error: unknown): error is { responseInfo: { statusCode: number; headers: Record<string, string | undefined> } }`
(a structural check on `responseInfo`). Keep the two steps (`describe-file`,
`upsert`) and the error mapping unchanged: 404 to `NonRetriableError`, 429 with
delta-seconds to `RetryAfterError` in milliseconds, 429 with an HTTP-date to a
60s wait, bare 429 and everything else rethrown. A `Retry-After` header that is
empty counts as absent (the pre-rewrite truthy check), so it takes the bare-429
path. The describe step result is validated with an `isRecord` guard into
`metadata`. The `upsert` step's thunk returns the `StoredDocument` it wrote; the
handler validates that step result with a small type guard (the ports return
`Promise<unknown>` and the locks forbid assertions) and returns it as
`upserted`, so deleting the upsert step breaks the tests. The handler returns
`{ documentId, metadata, upserted }`.

`src/box/client.ts`: `describeFile` returns `Promise<unknown>` (the SDK object
as-is); delete the `as unknown as` cast and update `BoxClientPort` to match.

Run: `bun test src/functions/process-file.test.ts` Expected: PASS.

- [ ] **Step 5: Fix the remaining gate blockers**

- `src/inngest.ts`: wire `step.run` / `step.sendEvent` into the step ports
  without assertions (the ports now use `Promise<unknown>`, which the SDK
  satisfies). Delete the `as unknown as` narrows and the `any` they leaked; the
  event payloads must not be `any` either, so type them through the Inngest
  client's event schema or narrow `event.data` with a guard. If the SDK's
  `sendEvent` payload type refuses `readonly` `SentEvent[]`, relax the port
  parameter to `SentEvent[]`.
- `src/db/schema.ts`: type the jsonb column
  (`jsonb<Record<string, unknown>>("metadata")`), deleting
  `src/db/document-store.ts`'s `as` at the read. If the Drizzle type parameter
  cannot express this, use an `isRecord` guard at the read instead; no casts.
- `src/index.ts`: re-add the line the rebase dropped,
  `.use(createContractsRoutes({ inngest, store: documentStore }))`, so the
  imports are used and the feature's HTTP API exists again. Keep `.listen(0)`
  and keep the Ctrl-C shutdown block deleted (both are the intended end state);
  the `pgPool` import is only referenced by that block, so drop it with it.
- `tsconfig.json`: add `"drizzle.config.ts"` to `include` (with a one-line
  comment that it is a `drizzle-kit` CLI file the app never imports), so the
  lint project service can parse it. If the gate instead proves
  `allowDefaultProject` is the right fix in `eslint.config.ts`, that is
  acceptable; pick one, minimally.

- [ ] **Step 6: Delete the excluded tests and format**

Run:
`git rm src/config/env.test.ts src/db/document-store.test.ts src/routes/contracts.test.ts`
Run: `bun run format` Run: `bun test` Expected: PASS, only the two unit-test
files run.

- [ ] **Step 7: Prove the gate, then commit**

Run:
`bun run format:check && bun run lint && bun run typecheck && bun run build`
Expected: all PASS. Zero disables, casts, `let`, loops, or `!` anywhere (the
lint proves it; do not add any).

```bash
git add -A
git restore --staged docs/superpowers/plans/2026-10-18-test-taxonomy-and-functional-refactor.md
git commit -m "refactor: satisfy the functional style locks and reduce tests to pure units"
```

- [ ] **Step 8: Commit the plan**

```bash
git add docs/superpowers/plans/2026-10-18-test-taxonomy-and-functional-refactor.md
git commit -m "docs: add the test taxonomy and functional refactor plan"
```
