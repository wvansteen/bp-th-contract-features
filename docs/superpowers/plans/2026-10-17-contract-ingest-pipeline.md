# Contract Ingest Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a contract ingest pipeline that lists files from a Box folder,
processes each file's metadata via Inngest events, stores it in Postgres, and
exposes it via a list endpoint.

**Architecture:** Elysia on Bun exposes two endpoints. `POST /process-contracts`
sends an Inngest event that pages through a Box folder and fans out one
`box/process.file` event per document. A single `list-files` run walks every
page itself and emits from the run body with `step.sendEvent`, so there is no
self-emitted paging event and no cross-event counter. Each `process-file` run
reads file metadata and upserts it into Postgres. `GET /contracts` reads all
stored metadata. One module (`src/deps.ts`) builds every dependency; everything
else receives them as parameters.

**Tech Stack:** TypeScript, Bun, Elysia, Inngest v4, `box-node-sdk` v10, Drizzle
ORM, postgres.js, Postgres 16

**Spec:** `docs/superpowers/specs/2026-10-17-contract-ingest-design.md`

---

## Global Constraints

- TypeScript on Bun, mostly functional style
- No env access outside `src/config/env.ts` and `src/deps.ts`
- Box auth: developer token via `BOX_APP_TOKEN`, wrapped by
  `BoxDeveloperTokenAuth` (see ADR-0006)
- Box folder id: `BOX_FOLDER_ID` env var, injected into handlers — never
  hardcoded in a function
- Rate limiting: honor Box's `429` + `Retry-After`; Inngest `throttle` on
  `process-file`, which queues rather than discards
- Concurrency: `{ limit: 1 }` on both functions
- DB table: `documents` with `document_id` (text PK) and `metadata` (jsonb)
- `maxDocuments` is capped at 1000 by request validation, for predictable cost
  and a bounded run
- Typecheck must pass before any commit (`bun run typecheck`)

### Platform Limits

Server-side Inngest limits, from Inngest's published usage-limits and
idempotency documentation. They are not enforced by the SDK or by the local dev
server, so they cannot be verified from the installed package. They bound the
design and must not be exceeded in production:

- **1,000 steps per function run.** One `list-files` run costs 2 steps per page
  (one `run`, one `sendEvent`). At page size 100 that caps a run at ~50,000
  files, but `maxDocuments` is capped at 1000 for predictable cost.
- **5,000 events per `step.sendEvent` call.** Page size is 100, so a page
  fan-out is far under the cap.
- **Event dedup window is 24 hours** for events carrying an explicit `id`.

### Delivery Semantics

The pipeline is **at-least-once** and stays correct through three independent
layers:

1. `step.sendEvent` is a durable step. A retried `list-files` run does not
   re-send a page whose send already succeeded.
2. Every emitted event carries a stable `id` (`box/process.file/<fileId>`), so
   Inngest does not start a second run for the same file within the 24h dedup
   window.
3. `process-file` only ever calls `DocumentStore.upsert`, which is conflict-safe
   on `document_id`.

No layer is assumed to be sufficient alone. This is why the upsert stays even
though `sendEvent` removes most duplicate work: the docs are explicit that a
failed `sendEvent` batch may have partially succeeded.

---

## Review Focus

1. **Document cap:** `maxDocuments` caps the total files processed across all
   pages, not per page
2. **Idempotent upserts:** Re-processing the same file must not duplicate rows
3. **Error propagation:** Box API failures in `process-file` are retried by
   Inngest; a Box `404` is non-retriable
4. **Pagination boundary:** When `totalCount` is not a multiple of page size,
   the last page still processes correctly
5. **Empty folder:** Listing an empty folder must not hang or error
6. **Non-file entries:** Folders and web links never produce a
   `box/process.file` event
7. **No duplicate fan-out on retry:** A retried `list-files` run must not
   re-send an already-sent page

---

### Task 1: Project setup — Postgres, Drizzle, env loading, typecheck

**Files:**

- Modify: `package.json`
- Modify: `compose.yaml`
- Create: `.env.example`
- Create: `tsconfig.json`
- Create: `drizzle.config.ts`
- Create: `src/config/env.ts`
- Create: `src/config/env.test.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `loadEnv(): Env` where
    `Env = { boxAppToken: string; boxFolderId: string; databaseUrl: string }`
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
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U bp -d contracts"]
    interval: 2s
    timeout: 3s
    retries: 15
```

The healthcheck is load-bearing. `podman compose up -d` returns before Postgres
accepts connections, so a `db:migrate` issued straight afterwards fails
intermittently on a cold image and reads as a plan bug.

- [ ] **Step 2: Add dependencies**

Run: `bun add drizzle-orm postgres box-node-sdk` Run:
`bun add -d drizzle-kit @types/bun` Run: `bun add -d typescript@5.9.3`

`typescript` is pinned because `bun run typecheck` gates every commit. Without a
pin, a `bun add -d typescript` resolves to whatever major ships that month, and
a new major can change diagnostics on unchanged source.

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

`db:migrate` passes `--env-file` because `drizzle-kit migrate` needs
`DATABASE_URL` to connect.

Also change the existing `dev:setup` script so the healthcheck is not
decorative:

```json
"dev:setup": "podman compose up -d --wait"
```

Without `--wait`, `podman compose up -d` returns as soon as the containers start
and ignores the healthcheck, so the `db:migrate` that follows races Postgres on
a cold image. `--wait` blocks until every service reports healthy.

- [ ] **Step 4: Write the failing test for env loading**

Create `src/config/env.test.ts`:

```ts
import { afterEach, describe, expect, it } from "bun:test";
import { loadEnv } from "./env";

const KEYS = ["BOX_APP_TOKEN", "BOX_FOLDER_ID", "DATABASE_URL"] as const;

// Snapshotted once at module load. Bun runs every test file in one process and
// shares `process.env` between them, so a restore that captures a value written
// by an earlier test hands a later file a fake token instead of the ambient one.
// A frozen copy, never reassigned. The restore is asserted against `AMBIENT`
// rather than `saved`, because `saved` is what the buggy version reassigns: an
// assertion against it matches the fake to itself and passes either way.
const AMBIENT: Record<string, string | undefined> = {};
for (const key of KEYS) AMBIENT[key] = process.env[key];

const saved: Record<string, string | undefined> = { ...AMBIENT };

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function clearEnv() {
  for (const key of KEYS) delete process.env[key];
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

  it("restores the ambient environment for other test files", () => {
    expect(process.env.BOX_APP_TOKEN).toBe(AMBIENT.BOX_APP_TOKEN);
  });
});
```

This sets and clears the vars explicitly rather than relying on a developer's
local `.env`, so the test is deterministic.

- [ ] **Step 5: Run test to verify it fails**

Run: `bun test src/config/env.test.ts` Expected: FAIL — module not found

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

Run: `bun test src/config/env.test.ts` Expected: PASS

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

`client` is returned so the composition root can close the pool. Default
`postgres.js` pool is `max: 10`; only one client is ever created (Task 3).

- [ ] **Step 9: Create `drizzle.config.ts`**

`drizzle-kit` needs this file for both `generate` and `migrate`. `dialect` is
mandatory.

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

Reading `process.env` here is a deliberate exception to the
no-env-outside-the-composition-root rule: this file is a `drizzle-kit` CLI
config, never imported by the running app.

- [ ] **Step 10: Generate and run initial migration**

Run: `bun run db:generate` Run: `bun run db:migrate` Expected: `drizzle/`
created with an initial migration; `documents` table exists

- [ ] **Step 11: Update `.env.example`**

`.env` is gitignored and `.env.example` is untracked, so this step writes the
whole file. It must list every variable the app reads, not only the two new
ones: a developer who copies this file to `.env` and starts the app gets a hard
`BOX_APP_TOKEN is required` without it, and without `INNGEST_DEV` the SDK
targets Inngest Cloud instead of the local dev server.

```
# Environment variables expected by this project.
# Copy this file to `.env` and fill in the real values. `.env` is gitignored.

# Run the Inngest SDK against the local Inngest dev server.
INNGEST_DEV=1

# Box API app token used by the Box integration.
BOX_APP_TOKEN=

# Box folder to ingest from.
BOX_FOLDER_ID=

# Postgres connection string (matches the compose.yaml service).
DATABASE_URL=postgresql://bp:bp@localhost:5432/contracts
```

- [ ] **Step 12: Typecheck and commit**

Run: `bun run typecheck` Expected: PASS

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

**Interfaces:**

- Consumes: `BOX_APP_TOKEN` (injected as `token`)
- Produces:
  - `BoxFileEntry = { id: string; type: string; name: string }`
  - `BoxPage = { entries: BoxFileEntry[]; totalCount: number }`
  - `BoxClientPort` with `listFiles` and `describeFile`
  - `createBoxClient({ token }: { token: string }): BoxClientPort`

- [ ] **Step 1: Read the SDK surface before writing code**

The SDK is `box-node-sdk` v10, whose API differs from older releases. Confirm
these before coding:

```bash
grep -n "getFolderItems" node_modules/box-node-sdk/lib-esm/managers/folders.d.ts
grep -n "getFileById" node_modules/box-node-sdk/lib-esm/managers/files.d.ts
grep -n "totalCount" node_modules/box-node-sdk/lib-esm/schemas/items.d.ts
```

Expected shapes:

- `client.folders.getFolderItems(folderId, { queryParams: { offset, limit } })`
  → `Items`
- `client.files.getFileById(fileId)` → `FileFull`
- `Items.totalCount` — **camelCase**. The raw REST API's `total_count` is
  renamed by the SDK. Do not use `total_count`.
- `Items.entries` is `readonly Item[]` where
  `Item = FileFull | FolderMini | WebLink`, so entries may be folders or web
  links. Both `entries` and `totalCount` are optional on `Items` itself.
- On each union member, `id` and `type` are **required** (declared on
  `FileBase`, `FolderBase`, and `WebLinkBase`), while `name` is **optional**.
  Verify this by probing rather than by grepping the whole file: `fileFull.d.ts`
  also contains nested interfaces such as `FileFullLockField` whose fields are
  optional, and a naive grep for `readonly id?:` matches those instead of the
  class.
- Auth is `new BoxClient({ auth: new BoxDeveloperTokenAuth({ token }) })`.

- [ ] **Step 2: Define the port and types**

Create `src/box/client.ts` with the types above it:

```ts
export type BoxFileEntry = { id: string; type: string; name: string };
export type BoxPage = { entries: BoxFileEntry[]; totalCount: number };

export interface BoxClientPort {
  listFiles(args: {
    folderId: string;
    offset: number;
    limit: number;
  }): Promise<BoxPage>;
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
  listFiles(args: {
    folderId: string;
    offset: number;
    limit: number;
  }): Promise<BoxPage>;
  describeFile(args: { fileId: string }): Promise<Record<string, unknown>>;
}

export function createBoxClient({ token }: { token: string }): BoxClientPort {
  const sdk = new BoxClient({ auth: new BoxDeveloperTokenAuth({ token }) });

  return {
    async listFiles({ folderId, offset, limit }) {
      const result = await sdk.folders.getFolderItems(folderId, {
        queryParams: { offset, limit },
      });

      // `totalCount` drives the pagination exit condition. Substituting a
      // default here would silently truncate the run to the first page, so a
      // missing field is an error instead.
      if (result.totalCount === undefined) {
        throw new Error(
          `Box returned no totalCount for folder ${folderId} at offset ${offset}`,
        );
      }

      return {
        entries: (result.entries ?? []).map((entry) => ({
          id: entry.id,
          type: entry.type,
          name: entry.name ?? "",
        })),
        totalCount: result.totalCount,
      };
    },

    async describeFile({ fileId }) {
      const file = await sdk.files.getFileById(fileId);
      return file as unknown as Record<string, unknown>;
    },
  };
}
```

The SDK handles auth headers and URL building internally. Do not re-add any of
that. It does not read Box's `Retry-After` header, so honoring that header is
`process-file`'s job (see its `429` mapping below).

- [ ] **Step 4: Decide the test strategy deliberately**

Do **not** unit-test `createBoxClient` by mocking `fetch`. The SDK imports
`node-fetch`, not the global, so `spyOn(globalThis, "fetch")` does not intercept
its calls and the test would silently pass without exercising anything.

Instead:

- Task 3 unit-tests the handlers against a hand-written `BoxClientPort` fake.
  That is where the logic lives.
- Task 7 verifies the real adapter end-to-end against the live API.

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

function fakeBox(
  pages: BoxPage[],
): BoxClientPort & { calls: Array<{ offset: number; limit: number }> } {
  const calls: Array<{ offset: number; limit: number }> = [];
  return {
    calls,
    async listFiles({ offset, limit }) {
      calls.push({ offset, limit });
      return (
        pages[Math.floor(offset / limit)] ?? { entries: [], totalCount: 0 }
      );
    },
    async describeFile() {
      throw new Error("not used");
    },
  };
}

function fakeSteps(): {
  steps: ListFilesSteps;
  sent: SentEvent[];
  stepIds: string[];
} {
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
    const box = fakeBox([
      { entries: [{ id: "7", type: "file", name: "a.pdf" }], totalCount: 1 },
    ]);
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
        entries: [
          { id: "1", type: "file", name: "a.pdf" },
          { id: "2", type: "file", name: "b.pdf" },
        ],
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
        const ids =
          offset === 0 ? ["1", "2"] : offset === 100 ? ["3", "4"] : ["5"];
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

    return {
      steps,
      sentAll,
      failOnceOn: (id: string) => {
        failOn = id;
      },
    };
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
    expect(steps.sentAll.map((e) => e.data.fileId)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/functions/list-files.test.ts` Expected: FAIL — module not
found

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

`processed` and `offset` are local variables. They never appear in an event
payload, so no counter is threaded across events and nothing depends on the
caller keeping them consistent.

#### Why a local variable is enough

Inngest does not preserve the function body between steps. Per its docs: _"When
it resumes, the handler runs again from the top: completed steps return their
saved result, but code outside a step runs again."_ So `offset` and `processed`
genuinely reset to `0` on every resume.

The loop still works because the value is **recomputed, not persisted**. On
re-entry the handler re-walks the memoized prefix:

1. `offset = 0`, `processed = 0` — locals reset
2. `step.run("page-0")` returns its saved result immediately, no pause
3. `step.sendEvent("emit-0")` returns its saved result immediately
4. `processed = 2`, `offset = 100` — same values as before, derived from the
   saved page result
5. `step.run("page-100")` is not yet saved, so _this_ is where the run pauses

Inngest's own pagination example uses exactly this shape: a local cursor in a
`do/while`, advanced by a cursor returned from each step.

The invariant this puts on the code is that the loop body must be a **pure
function of saved step results**. `offset` and `processed` derive only from
`page.totalCount` (a step result) and loop constants, so replay is
deterministic. That also means the step IDs must be derived from those same
deterministic values — `page-${offset}` and `emit-${offset}` are stable for a
given run.

Anything non-deterministic placed outside a step would break replay: a clock, a
random value, or a counter not derived from step results would make the re-entry
path diverge.

The old design needed the counter in the event payload for a different reason:
each page was a **separate run** started by a self-emitted event. Separate runs
share no memory at all, so event data was the only channel between them. Looping
inside one run removes that boundary.

- [ ] **Step 4: Write the failing tests for `process-file`**

Create `src/functions/process-file.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { NonRetriableError, RetryAfterError } from "inngest";
import { BoxApiError } from "box-node-sdk";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore, StoredDocument } from "../db/document-store";
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
    await processFileHandler(fakeBox({ id: "9" }), steps, store, {
      fileId: "9",
    });
    await processFileHandler(fakeBox({ id: "9" }), steps, store, {
      fileId: "9",
    });

    // Conflict handling is the adapter's job, which is what makes redelivery
    // safe. The port exposes no insert path at all.
    expect(calls).toEqual(["9", "9"]);
  });

  it("separates the describe and upsert into distinct steps", async () => {
    const { steps, stepIds } = fakeSteps();
    const store: DocumentStore = {
      async upsert() {},
      async listAll() {
        return [];
      },
    };

    await processFileHandler(fakeBox({ id: "5" }), steps, store, {
      fileId: "5",
    });

    expect(stepIds).toEqual(["describe-file", "upsert"]);
  });

  it("stores the described metadata and keys the row on the event fileId", async () => {
    const upserts: StoredDocument[] = [];
    const store: DocumentStore = {
      async upsert(doc) {
        upserts.push(doc);
      },
      async listAll() {
        return [];
      },
    };

    const { steps } = fakeSteps();
    // The described id deliberately differs from the event's fileId, so the two
    // possible sources of documentId cannot be confused for one another.
    await processFileHandler(
      fakeBox({ id: "server-side-id", name: "contract.pdf", size: 5000 }),
      steps,
      store,
      { fileId: "event-file-id" },
    );

    expect(upserts).toEqual([
      {
        documentId: "event-file-id",
        metadata: { id: "server-side-id", name: "contract.pdf", size: 5000 },
      },
    ]);
  });
});

describe("process-file error mapping", () => {
  function boxApiError(status: number, headers: Record<string, string> = {}) {
    return new BoxApiError({
      message: `Box API error: ${status}`,
      requestInfo: {
        method: "GET",
        url: "https://api.box.com/2.0/files/1",
        queryParams: {},
        headers: {},
      },
      responseInfo: { statusCode: status, headers },
    });
  }

  function failingBox(error: Error) {
    return {
      async listFiles() {
        throw new Error("not used");
      },
      async describeFile() {
        throw error;
      },
    } satisfies BoxClientPort;
  }

  // `RetryAfterError` divides whatever it is given by 1000 and stores the
  // result as a string of seconds, which is why the field is typed `string`.
  // So 120_000 ms is stored as "120".
  function retryAfterSeconds(error: unknown): string {
    return (error as RetryAfterError).retryAfter;
  }

  const noStore: DocumentStore = {
    async upsert() {
      throw new Error("upsert must not run when describe fails");
    },
    async listAll() {
      return [];
    },
  };

  it("makes a 404 non-retriable, since a deleted file will not come back", async () => {
    const { steps } = fakeSteps();

    await expect(
      processFileHandler(failingBox(boxApiError(404)), steps, noStore, {
        fileId: "1",
      }),
    ).rejects.toThrow(NonRetriableError);
  });

  it("passes a 429 Retry-After of seconds through as seconds", async () => {
    const { steps } = fakeSteps();
    const error = await processFileHandler(
      failingBox(boxApiError(429, { "retry-after": "120" })),
      steps,
      noStore,
      { fileId: "1" },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RetryAfterError);
    expect(retryAfterSeconds(error)).toBe("120");
  });

  it("falls back to a 60s wait when Retry-After is an HTTP-date", async () => {
    const { steps } = fakeSteps();
    const error = await processFileHandler(
      failingBox(
        boxApiError(429, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }),
      ),
      steps,
      noStore,
      { fileId: "1" },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RetryAfterError);
    // parseInt on a date is NaN, and a NaN retryAfter retries immediately.
    expect(retryAfterSeconds(error)).toBe("60");
  });

  it("rethrows a 429 that carries no Retry-After", async () => {
    const { steps } = fakeSteps();

    await expect(
      processFileHandler(failingBox(boxApiError(429)), steps, noStore, {
        fileId: "1",
      }),
    ).rejects.toBeInstanceOf(BoxApiError);
  });

  it("rethrows a 5xx so Inngest retries it", async () => {
    const { steps } = fakeSteps();

    await expect(
      processFileHandler(failingBox(boxApiError(503)), steps, noStore, {
        fileId: "1",
      }),
    ).rejects.toBeInstanceOf(BoxApiError);
  });

  it("rethrows a non-Box error unchanged", async () => {
    const { steps } = fakeSteps();

    await expect(
      processFileHandler(
        failingBox(new Error("socket hang up")),
        steps,
        noStore,
        { fileId: "1" },
      ),
    ).rejects.toThrow("socket hang up");
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
      // Ordered explicitly. Postgres returns rows in an unspecified order, and
      // an upserted row moves, so two identical ingests would otherwise produce
      // different `/contracts` responses.
      const rows = await db
        .select({
          document_id: documents.document_id,
          metadata: documents.metadata,
        })
        .from(documents)
        .orderBy(documents.document_id);

      return rows.map((row) => ({
        documentId: row.document_id,
        metadata: row.metadata as Record<string, unknown>,
      }));
    },
  };
}
```

Both Drizzle calls follow the real 0.45 API:

- `onConflictDoUpdate` takes `target` as a **column object**
  (`documents.document_id`), not a string, and `set` as a plain object, not a
  method.
- The select builder is awaitable directly. There is no `.all()` method —
  `await db.select({...}).from(...)` is the documented form.
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

      // Box sends Retry-After as either delta-seconds or an HTTP-date.
      // `parseInt` on a date yields NaN, and the guard is not optional: the
      // RetryAfterError constructor divides by 1000 and throws a plain Error
      // when the result is not finite, which would turn Box's backoff into an
      // immediate retry. RetryAfterError takes milliseconds and its message
      // argument first, and stores the value back as a string of seconds.
      const retryAfter = error.responseInfo.headers["retry-after"];
      if (status === 429 && retryAfter) {
        const seconds = Number.parseInt(retryAfter, 10);
        const waitMs = Number.isFinite(seconds) ? seconds * 1000 : 60_000;
        throw new RetryAfterError(
          `Box throttled file ${params.fileId}`,
          waitMs,
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

Run:
`bun test src/functions/list-files.test.ts src/functions/process-file.test.ts`
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

Both `src/inngest.ts` and `src/index.ts` import from here, so exactly one
Postgres pool and one Box client exist per process.

- [ ] **Step 9: Wire up the Inngest functions**

Modify `src/inngest.ts`:

```ts
import { Inngest } from "inngest";
import { boxClient, boxFolderId, documentStore } from "./deps";
import { listFilesHandler } from "./functions/list-files";
import {
  processFileHandler,
  type ProcessFileSteps,
} from "./functions/process-file";

export const inngest = new Inngest({ id: "contract-features" });

export const listFilesFn = inngest.createFunction(
  {
    id: "list-files",
    triggers: [{ event: "box/list.files" }],
    concurrency: { limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    // No cast needed here. `ListFilesSteps.run` is non-generic and `Jsonify` of
    // a plain-JSON `BoxPage` is `BoxPage`, so the real step object satisfies
    // the interface directly.
    await listFilesHandler(boxClient, step, {
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
    throttle: { limit: 1000, period: "1m" },
    retries: 3,
  },
  async ({ event, step }) => {
    // This cast is load-bearing. `ProcessFileSteps.run` is generic, and
    // Inngest's `step.run` returns `Jsonify<Awaited<T>>`, because a step result
    // is JSON round-tripped between attempts. `tsc` cannot prove the two agree
    // for an unconstrained `T` and emits TS2345, so the narrowing happens here
    // rather than leaking `any` through the handler signature.
    const steps = { run: step.run } as unknown as ProcessFileSteps;

    await processFileHandler(boxClient, steps, documentStore, {
      fileId: event.data.fileId,
    });
  },
);
```

Three details that matter, each verified against the installed SDK:

- **Trigger shape is `triggers: [{ event: "..." }]`.** `inngest@4.23.0` types
  declare `triggers?: InngestFunction.Trigger<string>[]`, and the working
  `hello.ts` in this repo already uses the array form. Passing a bare
  `{ event: ... }` as the second argument does not typecheck.
- **`throttle`, not `rateLimit`.** They are opposites on overflow. Inngest's own
  JSDoc says `rateLimit` is "a lossy, hard limit. Once the limit is hit, new
  runs will be skipped. To enqueue work when a rate limit is hit, use the
  `throttle` parameter" (`inngest/components/InngestFunction.d.ts:172-176`).
  `throttle` enqueues instead. With `concurrency: { limit: 1 }`, Inngest counts
  executing steps, so `maxDocuments` documents at 2 steps each serialize well
  past any one-minute window. `rateLimit` would drop documents with no error and
  no red run.
- **`step` is narrowed at the boundary, not typed as `any`.** Inngest's
  `step.run` returns `Jsonify<Awaited<T>>` through a middleware-transform
  conditional. For the generic `ProcessFileSteps.run` that is unsatisfiable and
  `tsc` emits TS2345, so the one cast above is required. For the non-generic
  `ListFilesSteps.run`, `Jsonify` of a plain-JSON `BoxPage` is `BoxPage`, so
  `step` is passed straight through. Verified both ways against
  `inngest@4.23.0`.

- [ ] **Step 10: Delete the hello-world demo**

Run: `git rm src/functions/hello.ts src/send.ts`

Leaving either in place means `src/send.ts` sends `demo/hello.world` to an event
with no registered trigger, so it looks like it works while doing nothing. Task
5 removes the matching README line.

Use `git rm` rather than `rm`, because `git add src/functions/` in the next step
stages the `hello.ts` deletion but not a plain `rm` of `src/send.ts`, which sits
outside that directory.

- [ ] **Step 11: Typecheck and commit**

Run: `bun run typecheck` Expected: PASS

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

function fakeInngest(): InngestEventSender & {
  events: Array<{ name: string; data: unknown }>;
} {
  const events: Array<{ name: string; data: unknown }> = [];
  return {
    events,
    async send(event) {
      events.push(event as { name: string; data: unknown });
    },
  };
}

function fakeStore(
  docs: Array<{ documentId: string; metadata: Record<string, unknown> }>,
): DocumentStore {
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
  it("returns 201 and sends box/list.files carrying the requested count", async () => {
    const inngest = fakeInngest();
    const app = createContractsRoutes({ inngest, store: fakeStore([]) });

    // Posted value deliberately differs from any literal in the route, so a
    // hardcoded payload cannot pass.
    const response = await app.handle(post({ maxDocuments: 7 }));

    expect(response.status).toBe(201);
    expect(inngest.events).toHaveLength(1);
    expect(inngest.events[0].name).toBe("box/list.files");
    expect(inngest.events[0].data).toEqual({ maxDocuments: 7 });
  });

  it("returns 500 when the send fails rather than reporting 201", async () => {
    const failing = {
      async send() {
        throw new Error("inngest unreachable");
      },
    };
    const app = createContractsRoutes({
      inngest: failing,
      store: fakeStore([]),
    });

    const response = await app.handle(post({ maxDocuments: 5 }));

    expect(response.status).toBe(500);
  });

  it("returns 422 when maxDocuments is missing", async () => {
    const app = createContractsRoutes({
      inngest: fakeInngest(),
      store: fakeStore([]),
    });
    const response = await app.handle(post({}));
    expect(response.status).toBe(422);
  });

  it("returns 422 when maxDocuments is not a positive integer", async () => {
    const app = createContractsRoutes({
      inngest: fakeInngest(),
      store: fakeStore([]),
    });
    expect((await app.handle(post({ maxDocuments: 0 }))).status).toBe(422);
    expect((await app.handle(post({ maxDocuments: -1 }))).status).toBe(422);
    expect((await app.handle(post({ maxDocuments: 1.5 }))).status).toBe(422);
  });

  it("returns 422 when maxDocuments exceeds the per-request cap", async () => {
    const app = createContractsRoutes({
      inngest: fakeInngest(),
      store: fakeStore([]),
    });
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

    const response = await app.handle(
      new Request("http://localhost/contracts"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // Set comparison, not an ordered one. Ordering is the Drizzle adapter's
    // contract and needs a real database to verify, not a fixed fake array.
    expect(
      [...body].sort((a: any, b: any) =>
        a.documentId.localeCompare(b.documentId),
      ),
    ).toEqual([
      { documentId: "1", metadata: { name: "contract.pdf" } },
      { documentId: "2", metadata: { name: "nda.pdf" } },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/routes/contracts.test.ts` Expected: FAIL — module not found

- [ ] **Step 3: Implement `createContractsRoutes`**

Create `src/routes/contracts.ts`:

```ts
import { Elysia, status, t } from "elysia";
import type { InngestEventSender } from "../deps";
import type { DocumentStore } from "../db/document-store";

// list-files emits one event per file and stops once `maxDocuments` files
// have been handled, so this cap bounds one run's fan-out at 1,000 per-file
// events. At 100 entries per page, reaching that cap takes 10 pages when the
// pages contain only files.
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

`body` is inferred from the `t.Object` schema, so there is no `body as {...}`
cast. Invalid input is rejected by Elysia with `422`, so the handler needs no
error branch.

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

// Fail-safe and idempotent. A rejecting `pgPool.end()` must not skip the exit,
// and a second signal must not call `end()` on an already-closed pool.
let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;

    void (async () => {
      try {
        await pgPool.end();
        await app.stop();
      } catch (error) {
        console.error("shutdown failed", error);
        process.exitCode = 1;
      } finally {
        process.exit();
      }
    })();
  });
}

console.log(
  `Elysia listening on http://${app.server?.hostname}:${app.server?.port}`,
);
```

The pool is closed on Ctrl-C and on `SIGTERM`, since a container stop or
supervisor shutdown sends `SIGTERM`, and `deps.ts` is imported rather than
rebuilding clients.

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test src/routes/contracts.test.ts` Expected: PASS

Run: `bun run typecheck` Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/ src/index.ts src/deps.ts
git commit -m "feat: add contract routes"
```

---

### Task 5: Document store verification against real Postgres

The upsert's conflict handling and the ordering of `listAll` are the two
properties Review Focus #2 depends on, and neither is reachable through the
fake-backed unit tests. They run here instead.

**Files:**

- Create: `src/db/document-store.test.ts`

**Interfaces:**

- Consumes: `createDrizzleDocumentStore` (Task 3), `documents` (Task 1)
- Produces: verified conflict-safe upsert and stable ordering

- [ ] **Step 1: Write the test**

Create `src/db/document-store.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";
import { createDrizzleDocumentStore } from "./document-store";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://bp:bp@localhost:5432/contracts";

const { db, client } = createDbClient(databaseUrl);
const store = createDrizzleDocumentStore(db);

beforeAll(async () => {
  await db.execute(sql`TRUNCATE documents`);
});

afterAll(async () => {
  await client.end();
});

describe("createDrizzleDocumentStore", () => {
  it("upserts without duplicating rows", async () => {
    await store.upsert({ documentId: "1", metadata: { name: "first.pdf" } });
    await store.upsert({ documentId: "1", metadata: { name: "renamed.pdf" } });
    await store.upsert({ documentId: "2", metadata: { name: "second.pdf" } });

    const rows = await store.listAll();

    expect(rows).toHaveLength(2);
    const one = rows.find((r) => r.documentId === "1");
    expect(one?.metadata).toEqual({ name: "renamed.pdf" });
  });

  it("orders by document_id, and re-upserting does not move a row", async () => {
    const before = (await store.listAll()).map((r) => r.documentId);

    await store.upsert({ documentId: "1", metadata: { name: "renamed.pdf" } });

    const after = (await store.listAll()).map((r) => r.documentId);

    expect(after).toEqual(before);
    expect([...after].sort()).toEqual(after);
  });
});
```

- [ ] **Step 2: Run against Postgres**

Run: `bun run dev:setup` Run: `bun run db:migrate` Run:
`bun test src/db/document-store.test.ts` Expected: PASS (2 tests)

If the second test fails on the ordering assertion, `.orderBy` is missing from
`listAll`. Without it Postgres returns rows in an unspecified order and an
upserted row moves.

- [ ] **Step 3: Commit**

```bash
git add src/db/document-store.test.ts
git commit -m "test: cover document store upsert and ordering against Postgres"
```

---

### Task 6: Documentation and ADRs

**Files:**

- Create: `docs/decisions/0006-box-api-authentication.md`
- Create: `docs/decisions/0007-data-model-and-database-driver.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`

**Interfaces:**

- Consumes: everything from Tasks 1-5
- Produces: shipped feature with complete docs

- [ ] **Step 1: Confirm the next free ADR number**

Run: `ls docs/decisions/`

`0000` through `0005` are taken (0005 is the chat UI ADR that landed on main),
so the next free numbers are `0006` and `0007`. Do not reuse `0001`. Two ADRs
are written below: Box auth and the data model.

- [ ] **Step 2: Write the ADR**

Create `docs/decisions/0006-box-api-authentication.md`, following
`docs/decisions/adr-template.md`:

````markdown
---
status: accepted
date: 2026-10-17
decision-makers: William Van Steen
---

# Box API authentication with a developer token

## Context and Problem Statement

The ingest pipeline calls the Box API to list folder items and read file
metadata. Local development runs against a personal Box account containing a
folder shared in from an enterprise account, so the auth method must work across
that boundary and must not require enterprise app configuration.

## Decision Drivers

- Works across a personal Box account and a folder shared from an enterprise one
- No enterprise app configuration or key management
- Sufficient for a proof of concept

## Considered Options

- Developer token
- JWT (server authentication) with a signed assertion
- Client Credentials Grant

## Decision Outcome

Chosen option: "Developer token", because it needs no key management or
enterprise setup and is sufficient for a proof of concept against an existing
folder.

### Consequences

- Good, because local setup is a single pasted token.
- Good, because it works across personal and shared enterprise folders.
- Bad, because the token expires every 60 minutes and must be regenerated by
  hand between local runs.
- Bad, because it cannot be used in production as-is.

### Confirmation

Every Box request carries `Authorization: Bearer $BOX_APP_TOKEN`, set by
`BoxDeveloperTokenAuth` in `src/box/client.ts`. Confirmed by this command, which
exits non-zero if the adapter stops constructing the SDK's developer-token auth:

```sh
grep -q "BoxDeveloperTokenAuth" src/box/client.ts
```
````

The live check is Task 7 Step 6, which opens the completed `page-0` step result
in the Inngest dev UI after a real ingest. The unit tests cannot check this:
they run against a `BoxClientPort` fake and never reach the SDK.

## More Information

Supersede this ADR with JWT or Client Credentials Grant before production use.

````

The body headings match `adr-template.md` and every existing ADR, and include
the `### Confirmation` element AGENTS.md requires.

- [ ] **Step 3: Write the data-model ADR**

Create `docs/decisions/0007-data-model-and-database-driver.md`, following
`docs/decisions/adr-template.md`:

```markdown
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

Task 5's `src/db/document-store.test.ts` runs against a real Postgres. It
truncates `documents`, then upserts `documentId` "1" twice and "2" once and
asserts two rows remain with "1" carrying the newest metadata. A second test
re-upserts "1" and asserts `listAll` returns the same order as before, and that
the order is sorted. Run `bun run dev:setup`, then
`bun run db:migrate`, then `bun test src/db/document-store.test.ts`.

## More Information

Revisit if the document count outgrows a single-column primary key, or if
document metadata needs querying rather than listing.
````

- [ ] **Step 4: Update README.md in place**

The README already has both an `## Install` and a `## Usage` section, and a
Table of Contents listing them. Edit the existing sections — do not append new
ones, or the document ends up with two `## Usage` headings and a Table of
Contents that disagrees with the body.

The Table of Contents also names a `Contributing` section that has never existed
in the body. It is pre-existing breakage, but it is in the file this task edits
and AGENTS.md requires a docs change to leave headings matching the Table of
Contents. Add the section rather than dropping the entry, since `AGENTS.md` is
the contribution guide and standard-readme expects the heading.

Replace the `## Install` section body with:

````markdown
- [Podman](https://podman.io/) for the Inngest dev server and Postgres.
- [Bun](https://bun.sh/) `1.2.23` (pinned in `package.json`).

```sh
bun install
```
````

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
````

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

Add a `## Contributing` section between `## Architecture Decisions` and
`## License`, so the heading the Table of Contents already names exists:

```markdown
## Contributing

Agent and contributor instructions live in [`AGENTS.md`](AGENTS.md).
```

Every other heading the Table of Contents names already exists, so those entries
stay as they are.

- [ ] **Step 5: Update CHANGELOG.md**

Add under `[Unreleased]` -> `### Added`:

```markdown
- Contract ingest pipeline: `POST /process-contracts` pages through a Box
  folder and processes each document's metadata via Inngest events;
  `GET /contracts` returns all stored document metadata from Postgres.
```

- [ ] **Step 6: Update AGENTS.md**

AGENTS.md has no `## Style` heading. Append a bullet to the `Style:` paragraph
that sits inside `## Project`, which currently reads:

```
Style: mostly functional, leaning on a managed effects system where it earns its
keep. Logging as a side effect is an accepted exception for this PoC.
```

Add:

```markdown
- **Dependency injection over env access.** Never read env vars or construct
  low-level clients inside a function. Build them at the composition root
  (`src/deps.ts`) and inject them. Pass capabilities as parameters, not
  globals. `drizzle.config.ts` is the one exception: it is a `drizzle-kit`
  CLI file the running app never imports.
```

Also correct the `Current state:` paragraph near the top of `AGENTS.md`, which
still claims the repository is documentation-only. It went stale in Task 1 and
this task is the docs task, so fix it here: the repository now has application
code under `src/`, a `package.json`, a `compose.yaml`, a `tsconfig.json`, and a
generated `drizzle/` migration.

- [ ] **Step 7: Commit**

```bash
git add docs/decisions/0006-box-api-authentication.md docs/decisions/0007-data-model-and-database-driver.md README.md CHANGELOG.md AGENTS.md
git commit -m "docs: add Box auth ADR and update README, CHANGELOG, AGENTS.md"
```

---

### Task 7: End-to-end verification

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

In the Inngest dev UI, open the `page-0` step result and count the entries whose
`type` is `file`. Compare that to the number of `box/process.file` events the
`emit-0` step sent. The two must be equal when `maxDocuments` allows the whole
page, and the event count must be lower than the raw entry count whenever the
page contained a folder or web link. Comparing sent events against the file
entries in the same step result is the only version of this check that can
fail; comparing them against `totalCount` passes whether or not the filter
exists.

- [ ] **Step 7: Verify the event-id dedup window on re-run**

Run: `curl -X POST http://localhost:3000/process-contracts -H "Content-Type: application/json" -d '{"maxDocuments": 5}'`
Expected: `201`, and zero new `box/process.file` runs in the dev UI. Every
emitted event carries `id: "box/process.file/<fileId>"`, and Inngest suppresses a
second run for an id it has already seen inside its 24-hour window.

This step verifies the event-id layer only. It does not exercise the upsert,
because the suppressed runs mean `upsert` never executes twice; Task 5 covers
that against a real database instead.

- [ ] **Step 8: Verify no duplicate rows**

Run: `curl http://localhost:3000/contracts`
Expected: the same set of documents as before the re-run, in the same order

- [ ] **Step 9: Verify a non-file entry does not produce a red run**

Check the Inngest dev UI for any `describe-file` step failing with a Box `404`.
Expected: none. If one appears, the entry filter in `list-files` is not matching
the `type` value Box actually returns.

- [ ] **Step 10: Commit any fixes found during verification**

```bash
git add -A
git commit -m "fix: address end-to-end verification findings"
```
````
