# Contract Ingest Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a contract ingest pipeline that lists files from a Box folder, processes each file's metadata via Inngest events, stores it in Postgres, and exposes it via a list endpoint.

**Architecture:** Elysia on Bun exposes two endpoints. `POST /process-contracts` sends an Inngest event that pages through a Box folder and fans out one `box/process.file` event per document. A single `list-files` run walks every page itself and emits from the run body with `step.sendEvent`, so there is no self-emitted paging event and no cross-event counter. Each `process-file` run reads file metadata and upserts it into Postgres. `GET /contracts` reads all stored metadata. One module (`src/deps.ts`) builds every dependency; everything else receives them as parameters.

**Tech Stack:** TypeScript, Bun, Elysia, Inngest v4, `box-node-sdk` v10, Drizzle ORM, postgres.js, Postgres 16

**Spec:** `docs/superpowers/specs/2026-10-17-contract-ingest-design.md`

---

## Global Constraints

- TypeScript on Bun, mostly functional style
- No env access outside `src/config/env.ts` and `src/deps.ts`
- Box auth: developer token via `BOX_APP_TOKEN`, wrapped by `BoxDeveloperTokenAuth` (see ADR-0005)
- Box folder id: `BOX_FOLDER_ID` env var, injected into handlers — never hardcoded in a function
- Rate limiting: honor Box's `429` + `Retry-After`; Inngest `rateLimit` on `process-file` (hard), not `throttle`
- Concurrency: `{ limit: 1 }` on both functions
- DB table: `documents` with `document_id` (text PK) and `metadata` (jsonb)
- `maxDocuments` is capped at 1000 by request validation (see Platform Limits)
- Typecheck must pass before any commit (`bun run typecheck`)

### Platform Limits (Inngest, verified)

These bound the design and must not be exceeded:

- **1,000 steps per function run.** One `list-files` run costs 2 steps per page (one `run`, one `sendEvent`). At page size 100 that caps a run at ~50,000 files, but `maxDocuments` is capped at 1000 for predictable cost.
- **5,000 events per `step.sendEvent` call.** Page size is 100, so a page fan-out is far under the cap.
- **Event dedup window is 24 hours** for events carrying an explicit `id`.

### Delivery Semantics

The pipeline is **at-least-once** and stays correct through three independent layers:

1. `step.sendEvent` is a durable step. A retried `list-files` run does not re-send a page whose send already succeeded.
2. Every emitted event carries a stable `id` (`box/process.file/<fileId>`), so Inngest does not start a second run for the same file within the 24h dedup window.
3. `process-file` only ever calls `DocumentStore.upsert`, which is conflict-safe on `document_id`.

No layer is assumed to be sufficient alone. This is why the upsert stays even though `sendEvent` removes most duplicate work: the docs are explicit that a failed `sendEvent` batch may have partially succeeded.

---

## Review Focus

1. **Document cap:** `maxDocuments` caps the total files processed across all pages, not per page
2. **Idempotent upserts:** Re-processing the same file must not duplicate rows
3. **Error propagation:** Box API failures in `process-file` are retried by Inngest; a Box `404` is non-retriable
4. **Pagination boundary:** When `totalCount` is not a multiple of page size, the last page still processes correctly
5. **Empty folder:** Listing an empty folder must not hang or error
6. **Non-file entries:** Folders and web links never produce a `box/process.file` event
7. **No duplicate fan-out on retry:** A retried `list-files` run must not re-send an already-sent page

---

### Task 1: Project setup — Postgres, Drizzle, env loading, typecheck

**Files:**
- Modify: `package.json`
- Modify: `compose.yaml`
- Modify: `.env.example`
- Create: `tsconfig.json`
- Create: `drizzle.config.ts`
- Create: `src/config/env.ts`
- Create: `src/config/env.test.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `loadEnv(): Env` where `Env = { boxAppToken: string; boxFolderId: string; databaseUrl: string }`
  - `createDbClient(databaseUrl: string) => { db: DrizzleDb; client: Sql }`
  - `documents` Drizzle table
  - `bun run typecheck` script

- [ ] **Step 1: Add Postgres to compose.yaml**

Add a `postgres` service alongside the existing Inngest dev service:

```yaml
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: bp
      POSTGRES_PASSWORD: bp
      POSTGRES_DB: contracts
    ports:
      - "5432:5432"
```

- [ ] **Step 2: Add dependencies**

Run: `bun add drizzle-orm postgres box-node-sdk`
Run: `bun add -d drizzle-kit @types/bun typescript`

- [ ] **Step 3: Add tsconfig.json and a typecheck script**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "moduleDetection": "force"
  },
  "include": ["src/**/*.ts"]
}
```

The `types` entry is `bun`, supplied by the `@types/bun` package. There is no
`bun-types` package; `"types": ["bun-types"]` fails with `TS2688`. `DOM` is in
`lib` because the routes and tests use `Request` and `Response`.

Add to `package.json` scripts:

```json
"typecheck": "tsc --noEmit",
"db:generate": "drizzle-kit generate",
"db:migrate": "bun --env-file=.env x drizzle-kit migrate"
```

`db:migrate` passes `--env-file` because `drizzle-kit migrate` needs `DATABASE_URL` to connect.

- [ ] **Step 4: Write the failing test for env loading**

Create `src/config/env.test.ts`:

```ts
import { afterEach, describe, expect, it } from "bun:test";
import { loadEnv } from "./env";

const KEYS = ["BOX_APP_TOKEN", "BOX_FOLDER_ID", "DATABASE_URL"] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function clearEnv() {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
}

describe("loadEnv", () => {
  it("returns all required env vars", () => {
    clearEnv();
    process.env.BOX_APP_TOKEN = "tok";
    process.env.BOX_FOLDER_ID = "298630595158";
    process.env.DATABASE_URL = "postgresql://bp:bp@localhost:5432/contracts";

    expect(loadEnv()).toEqual({
      boxAppToken: "tok",
      boxFolderId: "298630595158",
      databaseUrl: "postgresql://bp:bp@localhost:5432/contracts",
    });
  });

  it("throws when a required var is missing", () => {
    for (const key of KEYS) {
      clearEnv();
      process.env.BOX_APP_TOKEN = "tok";
      process.env.BOX_FOLDER_ID = "298630595158";
      process.env.DATABASE_URL = "postgresql://bp:bp@localhost:5432/contracts";
      delete process.env[key];

      expect(() => loadEnv()).toThrow(key);
    }
  });
});
```

This sets and clears the vars explicitly rather than relying on a developer's local `.env`, so the test is deterministic.

- [ ] **Step 5: Run test to verify it fails**

Run: `bun test src/config/env.test.ts`
Expected: FAIL — module not found

- [ ] **Step 6: Implement `loadEnv`**

Create `src/config/env.ts`:

```ts
export type Env = {
  boxAppToken: string;
  boxFolderId: string;
  databaseUrl: string;
};

export function loadEnv(): Env {
  const boxAppToken = process.env.BOX_APP_TOKEN;
  const boxFolderId = process.env.BOX_FOLDER_ID;
  const databaseUrl = process.env.DATABASE_URL;

  if (!boxAppToken) throw new Error("BOX_APP_TOKEN is required");
  if (!boxFolderId) throw new Error("BOX_FOLDER_ID is required");
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  return { boxAppToken, boxFolderId, databaseUrl };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `bun test src/config/env.test.ts`
Expected: PASS

- [ ] **Step 8: Implement Drizzle schema and client**

Create `src/db/schema.ts`:

```ts
import { pgTable, text, jsonb } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  document_id: text("document_id").primaryKey(),
  metadata: jsonb("metadata").notNull(),
});
```

Create `src/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DrizzleDb = ReturnType<typeof createDbClient>["db"];

export function createDbClient(databaseUrl: string) {
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });
  return { db, client };
}
```

`client` is returned so the composition root can close the pool. Default `postgres.js` pool is `max: 10`; only one client is ever created (Task 3).

- [ ] **Step 9: Create `drizzle.config.ts`**

`drizzle-kit` needs this file for both `generate` and `migrate`. `dialect` is mandatory.

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
```

Reading `process.env` here is a deliberate exception to the no-env-outside-the-composition-root rule: this file is a `drizzle-kit` CLI config, never imported by the running app.

- [ ] **Step 10: Generate and run initial migration**

Run: `bun run db:generate`
Run: `bun run db:migrate`
Expected: `drizzle/` created with an initial migration; `documents` table exists

- [ ] **Step 11: Update `.env.example`**

`.env` is gitignored — only `.env.example` is tracked. Add the two new vars:

```
# Box folder to ingest from.
BOX_FOLDER_ID=

# Postgres connection string (matches the compose.yaml service).
DATABASE_URL=postgresql://bp:bp@localhost:5432/contracts
```

- [ ] **Step 12: Typecheck and commit**

Run: `bun run typecheck`
Expected: PASS

```bash
git add package.json compose.yaml tsconfig.json drizzle.config.ts .env.example \
  src/config/env.ts src/config/env.test.ts src/db/schema.ts src/db/client.ts drizzle/
git commit -m "chore: add postgres, drizzle, box sdk, and typecheck"
```

Note: `.env` is gitignored, so it is never staged.

---

### Task 2: Box client over the official SDK

**Files:**
- Create: `src/box/client.ts`
- Create: `src/box/document-shape.ts`

**Interfaces:**
- Consumes: `BOX_APP_TOKEN` (injected as `token`)
- Produces:
  - `BoxFileEntry = { id: string; type: string; name: string }`
  - `BoxPage = { entries: BoxFileEntry[]; totalCount: number }`
  - `BoxClientPort` with `listFiles` and `describeFile`
  - `createBoxClient({ token }: { token: string }): BoxClientPort`

- [ ] **Step 1: Read the SDK surface before writing code**

The SDK is `box-node-sdk` v10, whose API differs from older releases. Confirm these before coding:

```bash
grep -n "getFolderItems" node_modules/box-node-sdk/lib-esm/managers/folders.d.ts
grep -n "getFileById" node_modules/box-node-sdk/lib-esm/managers/files.d.ts
grep -n "totalCount" node_modules/box-node-sdk/lib-esm/schemas/items.d.ts
```

Expected shapes:

- `client.folders.getFolderItems(folderId, { queryParams: { offset, limit } })` → `Items`
- `client.files.getFileById(fileId)` → `FileFull`
- `Items.totalCount` — **camelCase**. The raw REST API's `total_count` is renamed by the SDK. Do not use `total_count`.
- `Items.entries` is `Array<FileFull | FolderMini | WebLink>` — a union discriminated by `type`, so entries may be folders or web links.
- Auth is `new BoxClient({ auth: new BoxDeveloperTokenAuth({ token }) })`.

- [ ] **Step 2: Define the port and types**

Create `src/box/document-shape.ts`... actually put the types in `client.ts` directly:

```ts
export type BoxFileEntry = { id: string; type: string; name: string };
export type BoxPage = { entries: BoxFileEntry[]; totalCount: number };

export interface BoxClientPort {
  listFiles(args: { folderId: string; offset: number; limit: number }): Promise<BoxPage>;
  describeFile(args: { fileId: string }): Promise<Record<string, unknown>>;
}
```

- [ ] **Step 3: Implement `createBoxClient`**

Create `src/box/client.ts`:

```ts
import { BoxClient, BoxDeveloperTokenAuth } from "box-node-sdk";

export type BoxFileEntry = { id: string; type: string; name: string };
export type BoxPage = { entries: BoxFileEntry[]; totalCount: number };

export interface BoxClientPort {
  listFiles(args: { folderId: string; offset: number; limit: number }): Promise<BoxPage>;
  describeFile(args: { fileId: string }): Promise<Record<string, unknown>>;
}

export function createBoxClient({ token }: { token: string }): BoxClientPort {
  const sdk = new BoxClient({ auth: new BoxDeveloperTokenAuth({ token }) });

  return {
    async listFiles({ folderId, offset, limit }) {
      const result = await sdk.folders.getFolderItems(folderId, {
        queryParams: { offset, limit },
      });

      return {
        entries: (result.entries ?? []).map((entry) => ({
          id: entry.id ?? "",
          type: entry.type ?? "",
          name: entry.name ?? "",
        })),
        totalCount: result.totalCount ?? 0,
      };
    },

    async describeFile({ fileId }) {
      const file = await sdk.files.getFileById(fileId);
      return file as unknown as Record<string, unknown>;
    },
  };
}
```

The SDK handles auth headers, URL building, and `429` backoff internally. Do not re-add any of that.

- [ ] **Step 4: Decide the test strategy deliberately**

Do **not** unit-test `createBoxClient` by mocking `fetch`. The SDK imports `node-fetch`, not the global, so `spyOn(globalThis, "fetch")` does not intercept its calls and the test would silently pass without exercising anything.

Instead:

- Task 3 unit-tests the handlers against a hand-written `BoxClientPort` fake. That is where the logic lives.
- Task 6 verifies the real adapter end-to-end against the live API.

- [ ] **Step 5: Commit**

```bash
git add src/box/client.ts
git commit -m "feat: add Box client over the official SDK"
```

---

### Task 3: Inngest functions — list-files and process-file

**Files:**
- Create: `src/db/document-store.ts`
- Create: `src/functions/list-files.ts`
- Create: `src/functions/list-files.test.ts`
- Create: `src/functions/process-file.ts`
- Create: `src/functions/process-file.test.ts`
- Create: `src/deps.ts`
- Modify: `src/inngest.ts`
- Delete: `src/functions/hello.ts`
- Delete: `src/send.ts`

**Interfaces:**
- Consumes:
  - `BoxClientPort` (Task 2)
  - `createDbClient` (Task 1)
- Produces:
  - `DocumentStore` with `upsert` and `listAll`
  - `listFilesHandler`, `processFileHandler`
  - `listFilesFn`, `processFileFn`
  - Event `box/list.files`: `{ maxDocuments: number }`
  - Event `box/process.file`: `{ fileId: string }`
  - `boxClient`, `documentStore`, `pgPool` from `src/deps.ts`

- [ ] **Step 1: Write the failing tests for `list-files`**

Create `src/functions/list-files.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { BoxClientPort, BoxPage } from "../box/client";
import { listFilesHandler, type ListFilesSteps } from "./list-files";

type SentEvent = { id: string; name: string; data: { fileId: string } };

function fakeBox(pages: BoxPage[]): BoxClientPort & { calls: Array<{ offset: number; limit: number }> } {
  const calls: Array<{ offset: number; limit: number }> = [];
  return {
    calls,
    async listFiles({ offset, limit }) {
      calls.push({ offset, limit });
      return pages[Math.floor(offset / limit)] ?? { entries: [], totalCount: 0 };
    },
    async describeFile() {
      throw new Error("not used");
    },
  };
}

function fakeSteps(): { steps: ListFilesSteps; sent: SentEvent[]; stepIds: string[] } {
  const sent: SentEvent[] = [];
  const stepIds: string[] = [];
  const steps: ListFilesSteps = {
    async run(id, fn) {
      stepIds.push(id);
      return fn();
    },
    async sendEvent(id, events) {
      stepIds.push(id);
      sent.push(...events);
      return { ids: events.map(() => "evt") };
    },
  };
  return { steps, sent, stepIds };
}

const folder = { folderId: "123", maxDocuments: 10 };

describe("list-files", () => {
  it("emits one box/process.file per file on a single page", async () => {
    const box = fakeBox([
      {
        entries: [
          { id: "1", type: "file", name: "a.pdf" },
          { id: "2", type: "file", name: "b.pdf" },
        ],
        totalCount: 2,
      },
    ]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, folder);

    expect(sent).toHaveLength(2);
    expect(sent.map((e) => e.data.fileId)).toEqual(["1", "2"]);
    expect(sent.every((e) => e.name === "box/process.file")).toBe(true);
  });

  it("gives every event a stable id so redelivery cannot start a second run", async () => {
    const box = fakeBox([{ entries: [{ id: "7", type: "file", name: "a.pdf" }], totalCount: 1 }]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, folder);

    expect(sent[0].id).toBe("box/process.file/7");
  });

  it("caps total processed files across pages, not per page", async () => {
    const page = (ids: string[]): BoxPage => ({
      entries: ids.map((id) => ({ id, type: "file", name: `${id}.pdf` })),
      totalCount: 400,
    });
    const box = fakeBox([page(["1", "2"]), page(["3", "4"]), page(["5", "6"])]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, { folderId: "123", maxDocuments: 3 });

    expect(sent.map((e) => e.data.fileId)).toEqual(["1", "2", "3"]);
  });

  it("walks every page when the folder is larger than one page", async () => {
    const box = fakeBox([
      { entries: [{ id: "1", type: "file", name: "a.pdf" }], totalCount: 250 },
      { entries: [{ id: "2", type: "file", name: "b.pdf" }], totalCount: 250 },
      { entries: [{ id: "3", type: "file", name: "c.pdf" }], totalCount: 250 },
    ]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, { folderId: "123", maxDocuments: 10 });

    expect(sent.map((e) => e.data.fileId)).toEqual(["1", "2", "3"]);
    expect(box.calls.map((c) => c.offset)).toEqual([0, 100, 200]);
  });

  it("stops correctly when totalCount is not a multiple of page size", async () => {
    const box = fakeBox([
      {
        entries: [{ id: "1", type: "file", name: "a.pdf" }, { id: "2", type: "file", name: "b.pdf" }],
        totalCount: 101,
      },
      { entries: [{ id: "3", type: "file", name: "c.pdf" }], totalCount: 101 },
    ]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, { folderId: "123", maxDocuments: 10 });

    expect(sent.map((e) => e.data.fileId)).toEqual(["1", "2", "3"]);
    expect(box.calls).toHaveLength(2);
  });

  it("emits nothing and does not hang for an empty folder", async () => {
    const box = fakeBox([{ entries: [], totalCount: 0 }]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, { folderId: "123", maxDocuments: 10 });

    expect(sent).toHaveLength(0);
    expect(box.calls).toHaveLength(1);
  });

  it("filters out folders and web links", async () => {
    const box = fakeBox([
      {
        entries: [
          { id: "f1", type: "folder", name: "subfolder" },
          { id: "w1", type: "web_link", name: "link" },
          { id: "1", type: "file", name: "a.pdf" },
        ],
        totalCount: 3,
      },
    ]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, { folderId: "123", maxDocuments: 10 });

    expect(sent.map((e) => e.data.fileId)).toEqual(["1"]);
  });
});
```

Add a second `describe` block to the same file. This one simulates how Inngest
actually executes a function — step results memoized by ID, and the handler
re-entering from the top on every resume — and proves the loop rebuilds its own
state without any cross-event counter:

```ts
describe("list-files replay safety", () => {
  function replayingBox() {
    const calls: number[] = [];
    const box: BoxClientPort = {
      async listFiles({ offset }) {
        calls.push(offset);
        const ids = offset === 0 ? ["1", "2"] : offset === 100 ? ["3", "4"] : ["5"];
        return {
          entries: ids.map((id) => ({ id, type: "file", name: `${id}.pdf` })),
          totalCount: 201,
        };
      },
      async describeFile() {
        throw new Error("not used");
      },
    };
    return { box, calls };
  }

  function replayingSteps() {
    const memo = new Map<string, unknown>();
    const sentAll: SentEvent[] = [];
    let failOn: string | null = null;

    const steps: ListFilesSteps = {
      async run(id, fn) {
        if (memo.has(id)) return memo.get(id) as BoxPage;
        if (id === failOn) {
          failOn = null;
          throw new Error("transient failure");
        }
        const value = await fn();
        memo.set(id, value);
        return value;
      },
      async sendEvent(id, events) {
        if (memo.has(id)) return memo.get(id) as { ids: string[] };
        const out = { ids: events.map(() => "evt") };
        memo.set(id, out);
        sentAll.push(...events);
        return out;
      },
    };

    return { steps, sentAll, failOnceOn: (id: string) => { failOn = id; } };
  }

  it("rebuilds loop state from memoized steps after a mid-loop failure", async () => {
    const { box, calls } = replayingBox();
    const steps = replayingSteps();
    const params = { folderId: "1", maxDocuments: 10 };

    steps.failOnceOn("page-100");
    await expect(listFilesHandler(box, steps.steps, params)).rejects.toThrow(
      "transient failure",
    );

    // Second entry. `offset` and `processed` are back to 0.
    await listFilesHandler(box, steps.steps, params);

    // Each page was fetched exactly once despite the restart, because replay
    // walks the memoized prefix instead of re-running it.
    expect(calls).toEqual([0, 100, 200]);

    // And each page's fan-out was sent exactly once.
    expect(steps.sentAll.map((e) => e.data.fileId)).toEqual(["1", "2", "3", "4", "5"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/functions/list-files.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `list-files`**

Create `src/functions/list-files.ts`:

```ts
import type { BoxClientPort, BoxPage } from "../box/client";

export type SentEvent = { id: string; name: string; data: { fileId: string } };

export type ListFilesSteps = {
  run(id: string, fn: () => Promise<BoxPage>): Promise<BoxPage>;
  sendEvent(id: string, events: SentEvent[]): Promise<{ ids: string[] }>;
};

const PAGE_SIZE = 100;

export async function listFilesHandler(
  box: BoxClientPort,
  steps: ListFilesSteps,
  params: { folderId: string; maxDocuments: number },
): Promise<void> {
  const { folderId, maxDocuments } = params;

  let offset = 0;
  let processed = 0;

  while (processed < maxDocuments) {
    const page = await steps.run(`page-${offset}`, () =>
      box.listFiles({ folderId, offset, limit: PAGE_SIZE }),
    );

    // Box folder listings mix files, subfolders, and web links. Only files
    // have metadata worth storing, and only files can be described by id.
    const files = page.entries.filter((entry) => entry.type === "file");
    const batch = files.slice(0, maxDocuments - processed);

    if (batch.length > 0) {
      await steps.sendEvent(
        `emit-${offset}`,
        batch.map((file) => ({
          id: `box/process.file/${file.id}`,
          name: "box/process.file",
          data: { fileId: file.id },
        })),
      );
    }

    processed += batch.length;

    // The cap was reached part-way through this page.
    if (batch.length < files.length) break;

    // Last page. `totalCount` counts every entry type, so compare against the
    // offset we have walked rather than against `files.length`.
    if (offset + PAGE_SIZE >= page.totalCount) break;

    offset += PAGE_SIZE;
  }
}
```

`processed` and `offset` are local variables. They never appear in an event payload, so no counter is threaded across events and nothing depends on the caller keeping them consistent.

#### Why a local variable is enough

Inngest does not preserve the function body between steps. Per its docs: *"When
it resumes, the handler runs again from the top: completed steps return their
saved result, but code outside a step runs again."* So `offset` and `processed`
genuinely reset to `0` on every resume.

The loop still works because the value is **recomputed, not persisted**. On
re-entry the handler re-walks the memoized prefix:

1. `offset = 0`, `processed = 0` — locals reset
2. `step.run("page-0")` returns its saved result immediately, no pause
3. `step.sendEvent("emit-0")` returns its saved result immediately
4. `processed = 2`, `offset = 100` — same values as before, derived from the
   saved page result
5. `step.run("page-100")` is not yet saved, so *this* is where the run pauses

Inngest's own pagination example uses exactly this shape: a local cursor in a
`do/while`, advanced by a cursor returned from each step.

The invariant this puts on the code is that the loop body must be a **pure
function of saved step results**. `offset` and `processed` derive only from
`page.totalCount` (a step result) and loop constants, so replay is
deterministic. That also means the step IDs must be derived from those same
deterministic values — `page-${offset}` and `emit-${offset}` are stable for a
given run.

Anything non-deterministic placed outside a step would break replay: a clock,
a random value, or a counter not derived from step results would make the
re-entry path diverge.

The old design needed the counter in the event payload for a different reason:
each page was a **separate run** started by a self-emitted event. Separate runs
share no memory at all, so event data was the only channel between them. Looping
inside one run removes that boundary.

- [ ] **Step 4: Write the failing tests for `process-file`**

Create `src/functions/process-file.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore } from "../db/document-store";
import { processFileHandler, type ProcessFileSteps } from "./process-file";

function fakeBox(file: Record<string, unknown>): BoxClientPort {
  return {
    async listFiles() {
      throw new Error("not used");
    },
    async describeFile() {
      return file;
    },
  };
}

function fakeSteps(): { steps: ProcessFileSteps; stepIds: string[] } {
  const stepIds: string[] = [];
  const steps: ProcessFileSteps = {
    async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
      stepIds.push(id);
      return fn();
    },
  };
  return { steps, stepIds };
}

describe("process-file", () => {
  it("describes the file and upserts it", async () => {
    const store: DocumentStore & { upserts: Array<{ documentId: string }> } = {
      upserts: [],
      async upsert(doc) {
        this.upserts.push({ documentId: doc.documentId });
      },
      async listAll() {
        return [];
      },
    };

    const { steps } = fakeSteps();
    await processFileHandler(
      fakeBox({ id: "123", name: "contract.pdf", size: 5000 }),
      steps,
      store,
      { fileId: "123" },
    );

    expect(store.upserts).toHaveLength(1);
    expect(store.upserts[0].documentId).toBe("123");
  });

  it("writes through upsert only, so a redelivered event cannot duplicate a row", async () => {
    const calls: string[] = [];
    const store: DocumentStore = {
      async upsert(doc) {
        calls.push(doc.documentId);
      },
      async listAll() {
        return [];
      },
    };

    const { steps } = fakeSteps();
    await processFileHandler(fakeBox({ id: "9" }), steps, store, { fileId: "9" });
    await processFileHandler(fakeBox({ id: "9" }), steps, store, { fileId: "9" });

    // The port exposes no insert path at all. Conflict handling is the
    // adapter's job, which is what makes redelivery safe.
    expect(calls).toEqual(["9", "9"]);
    expect(Object.keys(store).sort()).toEqual(["listAll", "upsert"]);
  });

  it("separates the describe and upsert into distinct steps", async () => {
    const { steps, stepIds } = fakeSteps();
    const store: DocumentStore = {
      async upsert() {},
      async listAll() {
        return [];
      },
    };

    await processFileHandler(fakeBox({ id: "5" }), steps, store, { fileId: "5" });

    expect(stepIds).toEqual(["describe-file", "upsert"]);
  });
});
```

- [ ] **Step 5: Implement the document store**

Create `src/db/document-store.ts`:

```ts
import type { DrizzleDb } from "./client";
import { documents } from "./schema";

export type StoredDocument = {
  documentId: string;
  metadata: Record<string, unknown>;
};

export interface DocumentStore {
  upsert(doc: StoredDocument): Promise<void>;
  listAll(): Promise<StoredDocument[]>;
}

export function createDrizzleDocumentStore(db: DrizzleDb): DocumentStore {
  return {
    async upsert({ documentId, metadata }) {
      await db
        .insert(documents)
        .values({ document_id: documentId, metadata })
        .onConflictDoUpdate({
          target: documents.document_id,
          set: { metadata },
        });
    },

    async listAll() {
      const rows = await db
        .select({
          document_id: documents.document_id,
          metadata: documents.metadata,
        })
        .from(documents);

      return rows.map((row) => ({
        documentId: row.document_id,
        metadata: row.metadata as Record<string, unknown>,
      }));
    },
  };
}
```

Both Drizzle calls follow the real 0.45 API:

- `onConflictDoUpdate` takes `target` as a **column object** (`documents.document_id`), not a string, and `set` as a plain object, not a method.
- The select builder is awaitable directly. There is no `.all()` method — `await db.select({...}).from(...)` is the documented form.
- Selection fields must be column objects, not strings.

- [ ] **Step 6: Implement `process-file`**

Create `src/functions/process-file.ts`:

```ts
import { NonRetriableError, RetryAfterError } from "inngest";
import { BoxApiError } from "box-node-sdk";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore } from "../db/document-store";

export type ProcessFileSteps = {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
};

export async function processFileHandler(
  box: BoxClientPort,
  steps: ProcessFileSteps,
  store: DocumentStore,
  params: { fileId: string },
): Promise<void> {
  const metadata = await steps.run("describe-file", async () => {
    try {
      return await box.describeFile({ fileId: params.fileId });
    } catch (error) {
      if (!(error instanceof BoxApiError)) throw error;
      const status = error.responseInfo.statusCode;

      // A deleted or moved file will never exist again. Retrying just burns
      // three attempts and leaves a permanently red run.
      if (status === 404) {
        throw new NonRetriableError(`Box file ${params.fileId} not found`);
      }

      // Box tells us exactly how long to wait via Retry-After.
      // Box sends Retry-After in seconds; RetryAfterError reads a bare number
      // as milliseconds. Its message argument comes first.
      const retryAfter = error.responseInfo.headers["retry-after"];
      if (status === 429 && retryAfter) {
        throw new RetryAfterError(
          `Box throttled file ${params.fileId}`,
          parseInt(retryAfter, 10) * 1000,
        );
      }

      throw error;
    }
  });

  await steps.run("upsert", () =>
    store.upsert({ documentId: params.fileId, metadata }),
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun test src/functions/list-files.test.ts src/functions/process-file.test.ts`
Expected: PASS

- [ ] **Step 8: Create the single composition root**

Create `src/deps.ts`:

```ts
import { loadEnv } from "./config/env";
import { createBoxClient } from "./box/client";
import { createDbClient } from "./db/client";
import { createDrizzleDocumentStore } from "./db/document-store";

const env = loadEnv();
const { db, client: pgPool } = createDbClient(env.databaseUrl);

export const boxClient = createBoxClient({ token: env.boxAppToken });
export const documentStore = createDrizzleDocumentStore(db);
export const boxFolderId = env.boxFolderId;
export { pgPool };

// The structural subset of `Inngest` the routes need. `Inngest` satisfies it,
// and so does a plain object in tests.
export type InngestEventSender = {
  send(event: { name: string; data: unknown }): Promise<unknown>;
};
```

Both `src/inngest.ts` and `src/index.ts` import from here, so exactly one Postgres pool and one Box client exist per process.

- [ ] **Step 9: Wire up the Inngest functions**

Modify `src/inngest.ts`:

```ts
import { Inngest } from "inngest";
import { boxClient, boxFolderId, documentStore } from "./deps";
import { listFilesHandler, type ListFilesSteps } from "./functions/list-files";
import { processFileHandler, type ProcessFileSteps } from "./functions/process-file";

export const inngest = new Inngest({ id: "contract-features" });

export const listFilesFn = inngest.createFunction(
  {
    id: "list-files",
    triggers: [{ event: "box/list.files" }],
    concurrency: { limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    // Inngest's `step.run` is generic over the function shape and returns
    // `Jsonify<Awaited<T>>`, because a step result is JSON round-tripped
    // between attempts. `BoxPage` is plain JSON, so `Jsonify` is an identity
    // for it. Narrowing once here keeps the handler signatures honest instead
    // of spreading `any` through them.
    const steps = {
      run: step.run,
      sendEvent: step.sendEvent,
    } as unknown as ListFilesSteps;

    await listFilesHandler(boxClient, steps, {
      folderId: boxFolderId,
      maxDocuments: event.data.maxDocuments,
    });
  },
);

export const processFileFn = inngest.createFunction(
  {
    id: "process-file",
    triggers: [{ event: "box/process.file" }],
    concurrency: { limit: 1 },
    rateLimit: { limit: 1000, period: "1m" },
    retries: 3,
  },
  async ({ event, step }) => {
    const steps = { run: step.run } as unknown as ProcessFileSteps;

    await processFileHandler(boxClient, steps, documentStore, {
      fileId: event.data.fileId,
    });
  },
);
```

Three details that matter, each verified against the installed SDK:

- **Trigger shape is `triggers: [{ event: "..." }]`.** `inngest@4.23.0` types declare `triggers?: InngestFunction.Trigger<string>[]`, and the working `hello.ts` in this repo already uses the array form. Passing a bare `{ event: ... }` as the second argument does not typecheck.
- **`rateLimit`, not `throttle`.** Inngest's own docs describe `throttle` as soft, warning it "may lead to a large backlog"; `rateLimit` is the hard control.
- **`step` is narrowed at the boundary, not typed as `any`.** Inngest's `step.run` signature resolves through a middleware-transform conditional that cannot be satisfied structurally by a hand-written interface, so the adapter above asserts the one fact that matters — that `Jsonify` is an identity for our JSON-safe payloads. Attempting to pass `step` directly fails to compile.

- [ ] **Step 10: Delete the hello-world demo**

Delete `src/functions/hello.ts` and `src/send.ts`. Leaving them in place means `src/send.ts` sends `demo/hello.world` to an event with no registered trigger, so it looks like it works while doing nothing. Task 5 removes the matching README line.

- [ ] **Step 11: Typecheck and commit**

Run: `bun run typecheck`
Expected: PASS

```bash
git add src/db/document-store.ts src/functions/ src/deps.ts src/inngest.ts
git commit -m "feat: add Inngest functions for listing and processing files"
```

---

### Task 4: Elysia routes

**Files:**
- Create: `src/routes/contracts.ts`
- Create: `src/routes/contracts.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `inngest`, `documentStore` (Task 3)
- Produces: `createContractsRoutes(deps) => Elysia`

- [ ] **Step 1: Write the failing tests**

Create `src/routes/contracts.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { InngestEventSender } from "../deps";
import type { DocumentStore } from "../db/document-store";
import { createContractsRoutes } from "./contracts";

function fakeInngest(): InngestEventSender & { events: Array<{ name: string; data: unknown }> } {
  const events: Array<{ name: string; data: unknown }> = [];
  return {
    events,
    async send(event) {
      events.push(event as { name: string; data: unknown });
    },
  };
}

function fakeStore(docs: Array<{ documentId: string; metadata: Record<string, unknown> }>): DocumentStore {
  return {
    async upsert() {},
    async listAll() {
      return docs;
    },
  };
}

function post(body: unknown) {
  return new Request("http://localhost/process-contracts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /process-contracts", () => {
  it("returns 201 and sends box/list.files", async () => {
    const inngest = fakeInngest();
    const app = createContractsRoutes({ inngest, store: fakeStore([]) });

    const response = await app.handle(post({ maxDocuments: 5 }));

    expect(response.status).toBe(201);
    expect(inngest.events).toHaveLength(1);
    expect(inngest.events[0].name).toBe("box/list.files");
    expect(inngest.events[0].data).toEqual({ maxDocuments: 5 });
  });

  it("returns 422 when maxDocuments is missing", async () => {
    const app = createContractsRoutes({ inngest: fakeInngest(), store: fakeStore([]) });
    const response = await app.handle(post({}));
    expect(response.status).toBe(422);
  });

  it("returns 422 when maxDocuments is not a positive integer", async () => {
    const app = createContractsRoutes({ inngest: fakeInngest(), store: fakeStore([]) });
    expect((await app.handle(post({ maxDocuments: 0 }))).status).toBe(422);
    expect((await app.handle(post({ maxDocuments: -1 }))).status).toBe(422);
    expect((await app.handle(post({ maxDocuments: 1.5 }))).status).toBe(422);
  });

  it("returns 422 when maxDocuments exceeds the run step budget", async () => {
    const app = createContractsRoutes({ inngest: fakeInngest(), store: fakeStore([]) });
    expect((await app.handle(post({ maxDocuments: 1001 }))).status).toBe(422);
  });
});

describe("GET /contracts", () => {
  it("returns all stored documents", async () => {
    const app = createContractsRoutes({
      inngest: fakeInngest(),
      store: fakeStore([
        { documentId: "1", metadata: { name: "contract.pdf" } },
        { documentId: "2", metadata: { name: "nda.pdf" } },
      ]),
    });

    const response = await app.handle(new Request("http://localhost/contracts"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
      { documentId: "1", metadata: { name: "contract.pdf" } },
      { documentId: "2", metadata: { name: "nda.pdf" } },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/routes/contracts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `createContractsRoutes`**

Create `src/routes/contracts.ts`:

```ts
import { Elysia, status, t } from "elysia";
import type { InngestEventSender } from "../deps";
import type { DocumentStore } from "../db/document-store";

// Inngest allows 1,000 steps per run. list-files spends 2 steps per page of
// 100, so this bound keeps a single run far inside the budget and keeps the
// cost of one request predictable.
const MAX_DOCUMENTS_PER_RUN = 1000;

export function createContractsRoutes(deps: {
  inngest: InngestEventSender;
  store: DocumentStore;
}) {
  return new Elysia()
    .post(
      "/process-contracts",
      async ({ body }) => {
        await deps.inngest.send({
          name: "box/list.files",
          data: { maxDocuments: body.maxDocuments },
        });
        return status(201);
      },
      {
        body: t.Object({
          maxDocuments: t.Number({
            minimum: 1,
            maximum: MAX_DOCUMENTS_PER_RUN,
            multipleOf: 1,
          }),
        }),
      },
    )
    .get("/contracts", async () => deps.store.listAll());
}
```

`body` is inferred from the `t.Object` schema, so there is no `body as {...}` cast. Invalid input is rejected by Elysia with `422`, so the handler needs no error branch.

- [ ] **Step 4: Wire up `src/index.ts`**

Modify `src/index.ts`:

```ts
import { Elysia } from "elysia";
import { serve } from "inngest/bun";
import { inngest, listFilesFn, processFileFn } from "./inngest";
import { documentStore, pgPool } from "./deps";
import { createContractsRoutes } from "./routes/contracts";

const handler = serve({
  client: inngest,
  functions: [listFilesFn, processFileFn],
});

const app = new Elysia()
  .get("/", () => ({ ok: true }))
  .all("/api/inngest", ({ request }) => handler(request))
  .use(createContractsRoutes({ inngest, store: documentStore }))
  .listen(3000);

process.on("SIGINT", async () => {
  await pgPool.end();
  await app.stop();
  process.exit(0);
});

console.log(`Elysia listening on http://${app.server?.hostname}:${app.server?.port}`);
```

The pool is closed on shutdown, and `deps.ts` is imported rather than rebuilding clients.

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test src/routes/contracts.test.ts`
Expected: PASS

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/ src/index.ts src/deps.ts
git commit -m "feat: add contract routes"
```

---

### Task 5: Documentation and ADR

**Files:**
- Create: `docs/decisions/0005-box-api-authentication.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4
- Produces: shipped feature with complete docs

- [ ] **Step 1: Confirm the next free ADR number**

Run: `ls docs/decisions/`

`0000` through `0004` are taken, so the next free number is `0005`. Do not reuse `0001`.

- [ ] **Step 2: Write the ADR**

Create `docs/decisions/0005-box-api-authentication.md`, following `docs/decisions/adr-template.md`:

```markdown
---
status: accepted
date: 2026-10-17
decision-makers: William Van Steen
---

# Box API authentication with a developer token

## Context and Problem Statement

The ingest pipeline calls the Box API to list folder items and read file
metadata. Local development runs against a personal Box account containing a
folder shared in from an enterprise account, so the auth method must work
across that boundary and must not require enterprise app configuration.

## Considered Options

* Developer token
* JWT (server authentication) with a signed assertion
* Client Credentials Grant

## Decision Outcome

Chosen option: "Developer token", because it needs no key management or
enterprise setup and is sufficient for a proof of concept against an existing
folder.

### Consequences

* Good, because local setup is a single pasted token.
* Good, because it works across personal and shared enterprise folders.
* Bad, because the token expires every 60 minutes and must be regenerated by
  hand between local runs.
* Bad, because it cannot be used in production as-is.

### Confirmation

Every Box request carries `Authorization: Bearer $BOX_APP_TOKEN`. Verified by
`src/functions/list-files.test.ts` running against `BoxClientPort` plus the
end-to-end ingest check in the implementation plan's verification task.

## More Information

Supersede this ADR with JWT or Client Credentials Grant before production use.
```

The body headings match `adr-template.md` and every existing ADR, and include
the `### Confirmation` element AGENTS.md requires.

- [ ] **Step 3: Update README.md in place**

The README already has both an `## Install` and a `## Usage` section, and a
Table of Contents listing them. Edit the existing sections — do not append new
ones, or the document ends up with two `## Usage` headings and a Table of
Contents that disagrees with the body.

Replace the `## Install` section body with:

```markdown
- [Podman](https://podman.io/) for the Inngest dev server.
- [Bun](https://bun.sh/) `1.2.23` (pinned in `package.json`).

```sh
bun install
```

Copy `.env.example` to `.env` and fill in `BOX_APP_TOKEN`, `BOX_FOLDER_ID`, and
`DATABASE_URL`.
```

Replace the `## Usage` section body with:

````markdown
```sh
bun run dev:setup  # Inngest dev + Postgres; Inngest UI at http://localhost:8288
bun run dev        # Elysia API on http://localhost:3000
bun run db:migrate # apply the initial migration
```

Trigger an ingest run:

```sh
curl -X POST http://localhost:3000/process-contracts \
  -H "Content-Type: application/json" \
  -d '{"maxDocuments": 10}'
```

List stored document metadata:

```sh
curl http://localhost:3000/contracts
```

`GET /` returns `{ ok: true }`.
````

The `bun run src/send.ts` line is removed along with `src/send.ts` in Task 3.
Leave the Table of Contents unchanged — the headings it names still exist.

- [ ] **Step 4: Update CHANGELOG.md**

Add under `[Unreleased]` -> `### Added`:

```markdown
- Contract ingest pipeline: `POST /process-contracts` pages through a Box
  folder and processes each document's metadata via Inngest events;
  `GET /contracts` returns all stored document metadata from Postgres.
```

- [ ] **Step 5: Update AGENTS.md**

Add to the Style section:

```markdown
- **Dependency injection over env access.** Never read env vars or construct
  low-level clients inside a function. Build them at the composition root
  (`src/deps.ts`) and inject them. Pass capabilities as parameters, not globals.
```

- [ ] **Step 6: Commit**

```bash
git add docs/decisions/0005-box-api-authentication.md README.md CHANGELOG.md AGENTS.md
git commit -m "docs: add Box auth ADR and update README, CHANGELOG, AGENTS.md"
```

---

### Task 6: End-to-end verification

**Files:**
- No new files — this task verifies the full pipeline against real infrastructure

**Interfaces:**
- Consumes: all previous tasks
- Produces: verified working pipeline

- [ ] **Step 1: Start all services**

Run: `bun run dev:setup`
Run: `bun run db:migrate`
Run: `bun run dev`

- [ ] **Step 2: Verify both services respond**

Run: `curl http://localhost:8288`
Expected: Inngest dev server responds

Run: `curl http://localhost:3000`
Expected: `{"ok":true}`

- [ ] **Step 3: Trigger the ingest pipeline**

Run: `curl -X POST http://localhost:3000/process-contracts -H "Content-Type: application/json" -d '{"maxDocuments": 5}'`
Expected: `201`

- [ ] **Step 4: Verify events fire in the Inngest dev UI**

Open: http://localhost:8288
Expected: one `box/list.files` run and one `box/process.file` run per document,
with steps named `page-0`, `emit-0`, `describe-file`, `upsert`

- [ ] **Step 5: Verify documents in the database**

Run: `curl http://localhost:3000/contracts`
Expected: JSON array of up to 5 `{ documentId, metadata }` objects

- [ ] **Step 6: Verify the real Box adapter and entry filtering**

Confirm in the Inngest dev UI that the `page-0` step shows the real `totalCount`
from Box and that the number of `box/process.file` events is less than or equal
to it. If the Box folder contains subfolders or web links, the event count is
strictly less than `totalCount` — that is the filter working.

- [ ] **Step 7: Verify idempotency by re-running**

Run: `curl -X POST http://localhost:3000/process-contracts -H "Content-Type: application/json" -d '{"maxDocuments": 5}'`
Expected: `201`

- [ ] **Step 8: Verify no duplicate rows**

Run: `curl http://localhost:3000/contracts`
Expected: still exactly 5 documents — the upsert de-duplicates

- [ ] **Step 9: Verify a non-file entry does not produce a red run**

Check the Inngest dev UI for any `describe-file` step failing with a Box `404`.
Expected: none. If one appears, the entry filter in `list-files` is not matching
the `type` value Box actually returns.

- [ ] **Step 10: Commit any fixes found during verification**

```bash
git add -A
git commit -m "fix: address end-to-end verification findings"
```