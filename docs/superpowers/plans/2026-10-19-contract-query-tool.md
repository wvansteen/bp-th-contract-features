# Contract Query Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the chat assistant a `query_contracts` tool that runs
model-written, read-only SQL against the `documents` table and answers from the
rows.

**Architecture:** A parser guard (`pgsql-ast-parser`) admits exactly one
`select`/`with` statement with no write nodes. Drizzle runs it inside a
read-only transaction with a statement timeout, and results are capped at 100
rows. The OpenRouter client gains streamed tool-call support, and the agent
loops at most three tool rounds before a final prose round.

**Tech Stack:** Bun, TypeScript, Elysia, Drizzle ORM on postgres.js,
`@openrouter/sdk`, `pgsql-ast-parser` 12.0.2, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-10-19-contract-query-tool-design.md`

## Global Constraints

- Lint locks are errors: no `let`/`var`, no `for`/`while`/`do`, no assignment to
  variables, parameters, or properties, no `any`, no `!!`/`as`/`@ts-ignore`, no
  non-null `!`. Tests are linted too.
- No env reads or client construction outside `src/deps.ts`.
- Comments only for a short invariant note, a genuinely complex block, or a
  public JSDoc. No narration.
- The `/api/chat` SSE stream carries text only.
- Project gates are `bun run format:check`, `bun run lint`, `bun run typecheck`,
  `bun run test`, `bun run build`. Run `bun run format` before each commit; the
  pre-commit hook rejects unformatted files.
- One commit per task. Branch `feat/contract-query-tool`; PR against `main`.

## Review Focus

- A valid Postgres statement outside the parser grammar (`WITH RECURSIVE`, some
  CTE inserts) is rejected. The model must get the parser message back as a tool
  result and retry. Pinned by Task 1 step 1 (syntax errors propagate) and Task 4
  step 1 (query errors become JSON).
- A query that selects `document` returns PDF bytes. The user expects metadata
  only. Pinned by Task 2 step 1.
- A query returning thousands of rows or a wide result. The user expects a
  bounded answer, not a blown-up prompt. Pinned by Task 2 step 1 and Task 4
  step 1.
- The model calls an unknown tool, or emits several tool calls in one round. The
  user expects no crash. Pinned by Task 5 step 1 and Task 3 step 1.
- The model keeps emitting tool calls and never answers. The conversation must
  still end in prose. Pinned by Task 5 step 1.

---

### Task 1: Statement guard and decision record

**Files:**

- Modify: `package.json` (via `bun add`)
- Create: `src/db/query.ts`
- Test: `src/db/query.test.ts`
- Create: `docs/decisions/0010-model-written-sql-query-tool.md`

**Interfaces:**

- Consumes: nothing.
- Produces: `toSingleReadOnlyStatement(sql: string): string`, which returns the
  capped wrapper and throws on rejection.

- [ ] **Step 1: Add the dependency and write the failing test**

```sh
bun add pgsql-ast-parser@12.0.2
```

```ts
// src/db/query.test.ts
import { describe, expect, it } from "bun:test";
import { toSingleReadOnlyStatement } from "./query";

const wrap = (body: string) =>
  `select * from (${body}) as contract_query limit 101`;

describe("toSingleReadOnlyStatement", () => {
  it("wraps a select with the row cap", () => {
    expect(toSingleReadOnlyStatement("select document_id from documents")).toBe(
      wrap("select document_id from documents"),
    );
  });

  it("strips trailing semicolons", () => {
    expect(toSingleReadOnlyStatement("select 1;;")).toBe(wrap("select 1"));
  });

  it("accepts Postgres JSON operators", () => {
    const sql =
      "select smart_features->>'category' from documents where smart_features @> '{\"category\":\"lease\"}'";

    expect(toSingleReadOnlyStatement(sql)).toBe(wrap(sql));
  });

  it("accepts a with statement", () => {
    const sql = "with recent as (select * from documents) select * from recent";

    expect(toSingleReadOnlyStatement(sql)).toBe(wrap(sql));
  });

  it("rejects more than one statement", () => {
    expect(() =>
      toSingleReadOnlyStatement("select 1; drop table documents"),
    ).toThrow("Only one SQL statement is allowed");
  });

  it("rejects a non-select statement", () => {
    expect(() =>
      toSingleReadOnlyStatement("update documents set metadata = '{}'"),
    ).toThrow("Only SELECT and WITH statements are allowed");
  });

  it("rejects a write inside a CTE", () => {
    expect(() =>
      toSingleReadOnlyStatement(
        "with gone as (delete from documents returning *) select * from gone",
      ),
    ).toThrow("Only read-only statements are allowed");
  });

  it("propagates a syntax error", () => {
    expect(() => toSingleReadOnlyStatement("select from where")).toThrow(
      /Syntax error/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/db/query.test.ts` Expected: FAIL, "Cannot find module
'./query'".

- [ ] **Step 3: Implement `toSingleReadOnlyStatement` in `src/db/query.ts`**

```ts
const ROW_LIMIT = 101;

const READ_STATEMENT_TYPES: readonly string[] = [
  "select",
  "union",
  "union all",
  "values",
  "with",
  "with recursive",
];

const WRITE_NODE_TYPES: readonly string[] = ["insert", "update", "delete"];

export function toSingleReadOnlyStatement(sql: string): string {
  const statements = parse(sql);

  if (statements.length !== 1) {
    throw new Error("Only one SQL statement is allowed");
  }

  if (
    !statements.every((statement) =>
      READ_STATEMENT_TYPES.includes(statement.type),
    )
  ) {
    throw new Error("Only SELECT and WITH statements are allowed");
  }

  if (hasWriteNode(statements)) {
    throw new Error("Only read-only statements are allowed");
  }

  return `select * from (${sql.trim().replace(/;+$/, "")}) as contract_query limit ${ROW_LIMIT}`;
}
```

`hasWriteNode(value: unknown): boolean` walks the AST recursively: an array is a
write node if any element is one; an object is one if
`WRITE_NODE_TYPES.includes(String(value.type))` or any of its values is. Parse
with `parse`, not `parseFirst`: `parseFirst` silently drops a second statement.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/db/query.test.ts` Expected: 8 pass.

- [ ] **Step 5: Write ADR 0010**

`docs/decisions/0010-model-written-sql-query-tool.md`, MADR v4,
`status: accepted`, date `2026-10-19`, decision-maker `William Van Steen`. Two
or three sentences of context about the chat agent having no document access.
Drivers: answer from stored data, no new agent framework, key stays server-side.
Options: model-written SQL with a parser guard and read-only transaction; a
canned endpoint per question shape; a framework agent with typed query tools.
Outcome: model-written SQL, because the question shapes are unknown and the
guard is cheap. Consequences: good, any read shape works; bad, the parser
grammar rejects some valid SQL; bad, production needs a dedicated read-only
database role. Confirmation: `grep -q 'accessMode: "read only"' src/db/query.ts`
once Task 2 lands.

- [ ] **Step 6: Commit**

```sh
git add package.json bun.lock src/db/query.ts src/db/query.test.ts docs/decisions/0010-model-written-sql-query-tool.md
git commit -m "feat: guard model-written SQL to one read-only statement"
```

---

### Task 2: Read-only query runner

**Files:**

- Modify: `src/db/query.ts`
- Test: `src/db/query.test.ts`

**Interfaces:**

- Consumes: `toSingleReadOnlyStatement` from Task 1.
- Produces:
  - `type QueryRows = readonly Record<string, unknown>[]`
  - `type ContractQueryResult = { rows: QueryRows; truncated: boolean }`
  - `type ContractQuery = (sql: string) => Promise<ContractQueryResult>`
  - `interface ReadOnlySqlExecutor { inReadOnlyTransaction<T>(run: (execute: (statement: string) => Promise<QueryRows>) => Promise<T>): Promise<T> }`
  - `createContractQuery(executor: ReadOnlySqlExecutor): ContractQuery`
  - `createDrizzleExecutor(db: DrizzleDb): ReadOnlySqlExecutor`

- [ ] **Step 1: Write the failing test**

Append to `src/db/query.test.ts`:

```ts
import { createContractQuery, type ReadOnlySqlExecutor } from "./query";

const rowsExecutor = (
  rows: readonly Record<string, unknown>[],
): ReadOnlySqlExecutor => ({
  inReadOnlyTransaction: (run) => run(() => Promise.resolve(rows)),
});

describe("createContractQuery", () => {
  it("runs the guarded statement", async () => {
    const executor: ReadOnlySqlExecutor = {
      inReadOnlyTransaction: (run) =>
        run((statement) => {
          expect(statement).toBe(
            "select * from (select document_id from documents) as contract_query limit 101",
          );
          return Promise.resolve([]);
        }),
    };

    await createContractQuery(executor)("select document_id from documents");
  });

  it("drops the document column", async () => {
    const query = createContractQuery(
      rowsExecutor([{ document_id: "abc", document: new Uint8Array([1]) }]),
    );

    expect(await query("select * from documents")).toEqual({
      rows: [{ document_id: "abc" }],
      truncated: false,
    });
  });

  it("caps rows at 100 and flags truncation", async () => {
    const many = Array.from({ length: 101 }, (_value, index) => ({ n: index }));
    const result = await createContractQuery(rowsExecutor(many))(
      "select n from documents",
    );

    expect(result.rows).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });

  it("does not flag truncation at exactly 100 rows", async () => {
    const many = Array.from({ length: 100 }, (_value, index) => ({ n: index }));

    expect(
      (await createContractQuery(rowsExecutor(many))("select n from documents"))
        .truncated,
    ).toBe(false);
  });

  it("rejects an unsafe statement without running it", async () => {
    const executor: ReadOnlySqlExecutor = {
      inReadOnlyTransaction: () => Promise.reject(new Error("should not run")),
    };

    await expect(
      createContractQuery(executor)("update documents set metadata = '{}'"),
    ).rejects.toThrow("Only SELECT and WITH statements are allowed");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/db/query.test.ts` Expected: FAIL, `createContractQuery` is
not exported.

- [ ] **Step 3: Implement the runner in `src/db/query.ts`**

```ts
export type QueryRows = readonly Record<string, unknown>[];

export type ContractQueryResult = { rows: QueryRows; truncated: boolean };

export type ContractQuery = (sql: string) => Promise<ContractQueryResult>;

export interface ReadOnlySqlExecutor {
  inReadOnlyTransaction<T>(
    run: (execute: (statement: string) => Promise<QueryRows>) => Promise<T>,
  ): Promise<T>;
}

export const createContractQuery =
  (executor: ReadOnlySqlExecutor): ContractQuery =>
  async (statement) => {
    const rows = await executor.inReadOnlyTransaction((execute) =>
      execute(toSingleReadOnlyStatement(statement)),
    );
    const withoutPdf = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) => key !== "document"),
      ),
    );
    return {
      rows: withoutPdf.slice(0, MAX_ROWS),
      truncated: rows.length > MAX_ROWS,
    };
  };
```

with `const MAX_ROWS = ROW_LIMIT - 1;` next to `ROW_LIMIT`, so the wrapper
fetches 101 rows and the 101st only signals truncation. Do not destructure
`document` out of the row: the unused binding trips `no-unused-vars`.

```ts
export const createDrizzleExecutor = (db: DrizzleDb): ReadOnlySqlExecutor => ({
  inReadOnlyTransaction: (run) =>
    db.transaction(
      async (tx) => {
        await tx.execute(sql.raw(`set local statement_timeout = 5000`));
        return run((statement) =>
          tx.execute<Record<string, unknown>>(sql.raw(statement)),
        );
      },
      { accessMode: "read only" },
    ),
});
```

Imports: `parse` from `pgsql-ast-parser`; `sql` from `drizzle-orm`;
`type { DrizzleDb } from "./client"`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `bun test src/db/query.test.ts && bun run typecheck` Expected: 13 pass; tsc
exits 0.

- [ ] **Step 5: Commit**

```sh
git add src/db/query.ts src/db/query.test.ts
git commit -m "feat: run contract queries in a read-only transaction"
```

---

### Task 3: Streaming client with tool support

**Files:**

- Modify: `src/openrouter/client.ts`
- Test: `src/openrouter/client.test.ts`
- Modify: `src/smart-features/classify.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type ToolCall = { id: string; name: string; arguments: string }`
  - `type ChatTurn = { role: "system" | "user"; content: string } | { role: "assistant"; content: string; toolCalls?: readonly ToolCall[] } | { role: "tool"; content: string; toolCallId: string }`
  - `type ChatToolDefinition = { name: string; description: string; parameters: Record<string, unknown> }`
  - `type ChatStreamEvent = { type: "text"; text: string } | { type: "toolCalls"; calls: readonly ToolCall[] }`
  - `OpenRouterClientPort.chatStream(input: ChatInput): AsyncIterable<ChatStreamEvent>`,
    replacing `chatTextStream`
  - `toMessage(turn: ChatTurn): ChatMessages`,
    `toTool(definition: ChatToolDefinition): ChatFunctionTool`
  - `mergeToolCallFragments(fragments: readonly ToolCallFragment[], builders: readonly ToolCallBuilder[]): readonly ToolCallBuilder[]`
  - `toToolCalls(builders: readonly ToolCallBuilder[]): readonly ToolCall[]`
  - `type ToolCallFragment = { index: number; id?: string | undefined; name?: string | undefined; arguments?: string | undefined }`
  - `type ToolCallBuilder = { index: number; id: string; name: string; arguments: string }`

- [ ] **Step 1: Write the failing test**

```ts
// src/openrouter/client.test.ts
import { describe, expect, it } from "bun:test";
import {
  mergeToolCallFragments,
  toMessage,
  toTool,
  toToolCalls,
} from "./client";

describe("toMessage", () => {
  it("maps an assistant turn with tool calls", () => {
    expect(
      toMessage({
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_1",
            name: "query_contracts",
            arguments: '{"sql":"select 1"}',
          },
        ],
      }),
    ).toEqual({
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "query_contracts",
            arguments: '{"sql":"select 1"}',
          },
        },
      ],
    });
  });

  it("maps a tool result turn", () => {
    expect(
      toMessage({ role: "tool", content: "{}", toolCallId: "call_1" }),
    ).toEqual({
      role: "tool",
      content: "{}",
      toolCallId: "call_1",
    });
  });
});

describe("toTool", () => {
  it("wraps a definition as a function tool", () => {
    expect(
      toTool({
        name: "query_contracts",
        description: "read docs",
        parameters: { type: "object" },
      }),
    ).toEqual({
      type: "function",
      function: {
        name: "query_contracts",
        description: "read docs",
        parameters: { type: "object" },
      },
    });
  });
});

describe("mergeToolCallFragments", () => {
  it("joins argument fragments by index", () => {
    const start = mergeToolCallFragments(
      [
        {
          index: 0,
          id: "call_1",
          name: "query_contracts",
          arguments: '{"sql":',
        },
      ],
      [],
    );
    const merged = mergeToolCallFragments(
      [{ index: 0, arguments: '"select 1"}' }],
      start,
    );

    expect(toToolCalls(merged)).toEqual([
      {
        id: "call_1",
        name: "query_contracts",
        arguments: '{"sql":"select 1"}',
      },
    ]);
  });

  it("keeps separate calls apart", () => {
    const builders = mergeToolCallFragments(
      [
        { index: 0, id: "call_1", name: "a", arguments: "1" },
        { index: 1, id: "call_2", name: "b", arguments: "2" },
      ],
      [],
    );

    expect(toToolCalls(builders)).toEqual([
      { id: "call_1", name: "a", arguments: "1" },
      { id: "call_2", name: "b", arguments: "2" },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/openrouter/client.test.ts` Expected: FAIL,
`mergeToolCallFragments` is not exported.

- [ ] **Step 3: Implement in `src/openrouter/client.ts`**

Add the types above. Widen `ChatInput` with
`tools?: readonly ChatToolDefinition[]`. Replace `chatTextStream` with
`chatStream` on the port and in `createOpenRouterClient`.

Implement `toMessage` by role branch as today, adding the assistant `toolCalls`
map (annotate the map callback return as `ChatToolCall` if TS widens
`type: "function"`) and the `tool` branch. Implement `toTool` with the return
annotation `ChatFunctionTool`.

Implement `mergeToolCallFragments` as a reduce over fragments; an existing index
keeps the first non-empty `id` and `name` and concatenates `arguments`, a new
index appends a builder with `""` defaults. `toToolCalls` maps builders to
`{ id, name, arguments }`.

Replace the `textDeltas` generator with a recursion that yields text deltas and,
when the stream ends with builders, one
`{ type: "toolCalls", calls: toToolCalls(builders) }` event. Read fragments from
`chunk.choices[0]?.delta.toolCalls`, mapping each to
`{ index, id, name: call.function?.name, arguments: call.function?.arguments }`.
Send `tools: input.tools?.map(toTool)` in `chatRequest`.

- [ ] **Step 4: Update the classifier test fakes**

In `src/smart-features/classify.test.ts`, rename `noChatText` to `noChatEvents`
typed `AsyncGenerator<ChatStreamEvent>` and replace every
`chatTextStream: noChatText` with `chatStream: noChatEvents`. Import
`type ChatStreamEvent` from `../openrouter/client`.

- [ ] **Step 5: Run the tests and typecheck**

Run:
`bun test src/openrouter/client.test.ts src/smart-features/classify.test.ts && bun run typecheck`
Expected: all pass; tsc exits 0.

- [ ] **Step 6: Commit**

```sh
git add src/openrouter/client.ts src/openrouter/client.test.ts src/smart-features/classify.test.ts
git commit -m "feat: stream tool calls from the OpenRouter client"
```

---

### Task 4: `query_contracts` tool

**Files:**

- Create: `src/chat/tools.ts`
- Test: `src/chat/tools.test.ts`

**Interfaces:**

- Consumes: `ContractQuery` from Task 2; `ChatToolDefinition` from Task 3;
  `SmartFeature` from `src/smart-features/features`.
- Produces:
  - `type ChatTool = { definition: ChatToolDefinition; run(argumentsJson: string): Promise<string> }`
  - `createQueryContractsTool(deps: { query: ContractQuery; features: readonly SmartFeature[] }): ChatTool`

- [ ] **Step 1: Write the failing test**

```ts
// src/chat/tools.test.ts
import { describe, expect, it } from "bun:test";
import type { ContractQuery } from "../db/query";
import { SMART_FEATURES } from "../smart-features/features";
import { createQueryContractsTool } from "./tools";

const answering =
  (result: Awaited<ReturnType<ContractQuery>>): ContractQuery =>
  () =>
    Promise.resolve(result);

const failing =
  (error: Error): ContractQuery =>
  () =>
    Promise.reject(error);

const tool = createQueryContractsTool({
  query: answering({ rows: [{ document_id: "abc" }], truncated: false }),
  features: SMART_FEATURES,
});

describe("createQueryContractsTool", () => {
  it("names the table and the JSON operators in its description", () => {
    expect(tool.definition.name).toBe("query_contracts");
    expect(tool.definition.description).toContain("documents");
    expect(tool.definition.description).toContain("smart_features");
    expect(tool.definition.description).toContain("->>");
    expect(tool.definition.description).toContain("@>");
  });

  it("lists every configured smart feature", () => {
    SMART_FEATURES.forEach((feature) => {
      expect(tool.definition.description).toContain(feature.name);
    });
  });

  it("returns the rows as JSON", async () => {
    expect(await tool.run('{"sql":"select document_id from documents"}')).toBe(
      JSON.stringify({ rows: [{ document_id: "abc" }], truncated: false }),
    );
  });

  it("returns a query error as JSON", async () => {
    const rejected = createQueryContractsTool({
      query: failing(new Error("Only SELECT and WITH statements are allowed")),
      features: [],
    });

    expect(
      await rejected.run('{"sql":"update documents set metadata = 1"}'),
    ).toBe(
      JSON.stringify({ error: "Only SELECT and WITH statements are allowed" }),
    );
  });

  it("rejects arguments that are not JSON", async () => {
    expect(await tool.run("not json")).toBe(
      JSON.stringify({ error: "Arguments must be valid JSON" }),
    );
  });

  it("rejects arguments without a sql string", async () => {
    expect(await tool.run('{"query":"select 1"}')).toBe(
      JSON.stringify({ error: "Missing sql string" }),
    );
  });

  it("refuses a result larger than 20000 characters", async () => {
    const wide = "x".repeat(20_001);
    const big = createQueryContractsTool({
      query: answering({ rows: [{ wide }], truncated: false }),
      features: [],
    });

    expect(await big.run('{"sql":"select wide from documents"}')).toBe(
      JSON.stringify({
        error: "Result too large. Select fewer columns or rows.",
      }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/chat/tools.test.ts` Expected: FAIL, "Cannot find module
'./tools'".

- [ ] **Step 3: Implement `src/chat/tools.ts`**

```ts
const MAX_RESULT_CHARS = 20_000;

export type ChatTool = {
  definition: ChatToolDefinition;
  run(argumentsJson: string): Promise<string>;
};

type SqlArgument = { sql: string } | { error: string };

export const createQueryContractsTool = ({
  query,
  features,
}: {
  query: ContractQuery;
  features: readonly SmartFeature[];
}): ChatTool => ({
  definition: {
    name: "query_contracts",
    description: descriptionFor(features),
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "One PostgreSQL SELECT or WITH statement.",
        },
      },
      required: ["sql"],
    },
  },
  run: async (argumentsJson) => {
    const argument = sqlOf(argumentsJson);
    if ("error" in argument) return JSON.stringify({ error: argument.error });
    try {
      const payload = JSON.stringify(await query(argument.sql));
      if (payload.length > MAX_RESULT_CHARS) {
        return JSON.stringify({
          error: "Result too large. Select fewer columns or rows.",
        });
      }
      return payload;
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
```

`sqlOf(argumentsJson): SqlArgument` puts `JSON.parse` into an `unknown` binding
inside a `try`, returning `{ error: "Arguments must be valid JSON" }` on a
throw, then an `isRecord` guard plus `typeof parsed.sql === "string"` before
returning `{ sql: parsed.sql }`, else `{ error: "Missing sql string" }`. Copy
the local `isRecord` helper from `src/functions/process-file.ts`.

`descriptionFor(features)` returns exactly:

```
Read the county's contract documents and their extracted smart features.

The table is documents:
- document_id text: the Box file id.
- metadata jsonb: the Box file record. Useful keys: metadata->>'name', metadata->>'size', metadata->>'created_at', metadata->>'modified_at'.
- smart_features jsonb: extracted contract values keyed by feature name: <names joined with ", ">. Values are strings, possibly empty.
- document bytea: the PDF. Never select it.

Use PostgreSQL JSON syntax, for example:
- smart_features->>'category' = 'lease'
- (smart_features->>'total_cost')::numeric > 100000
- smart_features @> '{"category":"technology_services"}'
- (smart_features->>'expiration_date')::date between now() and now() + interval '90 days'
- metadata->>'name' ilike '%renewal%'

Send exactly one SELECT or WITH statement. Results are capped at 100 rows.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/chat/tools.test.ts` Expected: 7 pass.

- [ ] **Step 5: Commit**

```sh
git add src/chat/tools.ts src/chat/tools.test.ts
git commit -m "feat: add the query_contracts chat tool"
```

---

### Task 5: Agent tool loop

**Files:**

- Modify: `src/chat/agent.ts`
- Modify: `src/deps.ts`
- Test: `src/chat/agent.test.ts`

**Interfaces:**

- Consumes: `ChatTool` from Task 4; `ChatStreamEvent`, `ChatTurn`,
  `OpenRouterClientPort` from Task 3.
- Produces:
  `createChatAgent(deps: { client: OpenRouterClientPort; model: string; tools: readonly ChatTool[] }): ChatAgent`

- [ ] **Step 1: Write the failing test**

```ts
// src/chat/agent.test.ts
import { describe, expect, it } from "bun:test";
import type {
  ChatStreamEvent,
  OpenRouterClientPort,
} from "../openrouter/client";
import { createChatAgent, type ChatMessage } from "./agent";
import type { ChatTool } from "./tools";

async function* streamOf(
  events: readonly ChatStreamEvent[],
): AsyncGenerator<ChatStreamEvent> {
  yield* events;
}

const drain = async (iterator: AsyncIterator<string>): Promise<string> => {
  const next = await iterator.next();
  return next.done ? "" : next.value + (await drain(iterator));
};

const scriptedClient = (
  rounds: readonly (readonly ChatStreamEvent[])[],
): OpenRouterClientPort => ({
  complete: () => Promise.reject(new Error("not used")),
  chatStream: (input) =>
    streamOf(
      rounds[input.messages.filter((m) => m.role === "assistant").length] ?? [],
    ),
});

const model = "deepseek/deepseek-v4.1-flash-1017";
const ask = (text: string): readonly ChatMessage[] => [{ role: "user", text }];
const text = (...parts: readonly string[]): readonly ChatStreamEvent[] =>
  parts.map((part) => ({ type: "text", text: part }));

const toolCall = (id: string, name: string, args: string): ChatStreamEvent => ({
  type: "toolCalls",
  calls: [{ id, name, arguments: args }],
});

const echoTool = (result: string): ChatTool => ({
  definition: { name: "query_contracts", description: "", parameters: {} },
  run: () => Promise.resolve(result),
});

const collect = (reply: AsyncIterable<string>): Promise<string> =>
  drain(reply[Symbol.asyncIterator]());

describe("createChatAgent", () => {
  it("streams the model's text", async () => {
    const agent = createChatAgent({
      client: scriptedClient([text("Hello", " there")]),
      model,
      tools: [],
    });

    expect(await collect(agent({ messages: ask("hi") }))).toBe("Hello there");
  });

  it("runs the tool and sends its result back", async () => {
    const toolResult = JSON.stringify({
      rows: [{ document_id: "abc" }],
      truncated: false,
    });
    const rounds: readonly (readonly ChatStreamEvent[])[] = [
      [toolCall("call_1", "query_contracts", '{"sql":"select 1"}')],
      [{ type: "text", text: "Found one." }],
    ];
    const client: OpenRouterClientPort = {
      complete: () => Promise.reject(new Error("not used")),
      chatStream: (input) => {
        const answered = input.messages.filter(
          (m) => m.role === "assistant",
        ).length;
        if (answered === 0) {
          expect(input.tools).toEqual([echoTool(toolResult).definition]);
        }
        if (answered === 1) {
          expect(input.messages.slice(-2)).toEqual([
            {
              role: "assistant",
              content: "",
              toolCalls: [
                {
                  id: "call_1",
                  name: "query_contracts",
                  arguments: '{"sql":"select 1"}',
                },
              ],
            },
            { role: "tool", content: toolResult, toolCallId: "call_1" },
          ]);
        }
        return streamOf(rounds[answered] ?? []);
      },
    };
    const agent = createChatAgent({
      client,
      model,
      tools: [echoTool(toolResult)],
    });

    expect(await collect(agent({ messages: ask("what contracts?") }))).toBe(
      "Found one.",
    );
  });

  it("reports an unknown tool to the model", async () => {
    const client: OpenRouterClientPort = {
      complete: () => Promise.reject(new Error("not used")),
      chatStream: (input) => {
        const answered = input.messages.filter(
          (m) => m.role === "assistant",
        ).length;
        if (answered === 1) {
          expect(input.messages[input.messages.length - 1]).toEqual({
            role: "tool",
            content: JSON.stringify({ error: "Unknown tool nope" }),
            toolCallId: "call_1",
          });
        }
        return streamOf(
          answered === 0
            ? [toolCall("call_1", "nope", "{}")]
            : [{ type: "text", text: "Sorry." }],
        );
      },
    };
    const agent = createChatAgent({ client, model, tools: [] });

    expect(await collect(agent({ messages: ask("hi") }))).toBe("Sorry.");
  });

  it("stops after three tool rounds", async () => {
    const rounds = [
      [toolCall("call_1", "query_contracts", "{}")],
      [toolCall("call_2", "query_contracts", "{}")],
      [toolCall("call_3", "query_contracts", "{}")],
      text("Out of attempts."),
    ];
    const client: OpenRouterClientPort = {
      complete: () => Promise.reject(new Error("not used")),
      chatStream: (input) => {
        const answered = input.messages.filter(
          (m) => m.role === "assistant",
        ).length;
        if (answered === 3) expect(input.tools).toBeUndefined();
        return streamOf(rounds[answered] ?? []);
      },
    };
    const agent = createChatAgent({ client, model, tools: [echoTool("{}")] });

    expect(await collect(agent({ messages: ask("hi") }))).toBe(
      "Out of attempts.",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/chat/agent.test.ts` Expected: FAIL, `createChatAgent` takes
no `tools` and the port has no `chatStream`.

- [ ] **Step 3: Implement the loop in `src/chat/agent.ts`**

`const MAX_TOOL_ROUNDS = 3;`

Update `SYSTEM_PROMPT` to:

> You are the Contract Investigation assistant for Lake County, Illinois. Answer
> questions in plain language. The county's contract documents are stored in the
> documents table; call the query_contracts tool to read them, and answer from
> its results. When the results do not answer the question, say so plainly
> instead of guessing.

`createChatAgent({ client, model, tools })` returns
`({ messages }) => converse({ client, model, tools }, [system, ...mapped messages], MAX_TOOL_ROUNDS)`.

`converse` is an async generator recursing with `roundsLeft`:

- `roundsLeft === 0`: stream one round with no tools and yield only its text.
- Otherwise stream a round with `tools.map((tool) => tool.definition)`, using
  `const calls = yield* round(events, [])` where `round` is an
  `AsyncGenerator<string, readonly ToolCall[]>` that yields text deltas and
  returns the calls.
- No calls: return, ending the reply.
- Calls: `Promise.all` them. `tool.run(call.arguments)` when a tool matches by
  `definition.name`, otherwise `JSON.stringify({ error: `Unknown tool
  ${call.name}` })`. Then recurse with the appended
  `{ role: "assistant", content: "", toolCalls: calls }` and one
  `{ role: "tool", content, toolCallId: call.id }` per call, and
  `roundsLeft - 1`.

Look tools up with `tools.find`, not a `Map`; mutating a map is lint-blocked.

Finally add `tools: []` to the `createChatAgent` call in `src/deps.ts`, so the
project still typechecks. Task 6 replaces it with the real tool.

- [ ] **Step 4: Run the tests and typecheck**

Run: `bun test src/chat/agent.test.ts && bun run typecheck` Expected: 4 pass;
tsc exits 0.

- [ ] **Step 5: Commit**

```sh
git add src/chat/agent.ts src/chat/agent.test.ts src/deps.ts
git commit -m "feat: let the chat agent call tools before answering"
```

---

### Task 6: Wiring, docs, and gates

**Files:**

- Modify: `src/deps.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: everything from Tasks 1-5.
- Produces: the running app.

- [ ] **Step 1: Wire the tool in `src/deps.ts`**

```ts
const contractQuery = createContractQuery(createDrizzleExecutor(db));

export const chatAgent = createChatAgent({
  client: openRouterClient,
  model: env.chatModel,
  tools: [
    createQueryContractsTool({
      query: contractQuery,
      features: SMART_FEATURES,
    }),
  ],
});
```

Keep `const { db } = createDbClient(env.databaseUrl);` and `SMART_FEATURES`
already imported. This replaces the `tools: []` placeholder from Task 5.

- [ ] **Step 2: Update the README**

In `## Usage`, extend the `/` bullet: the assistant answers contract questions
by querying the stored documents. Add one paragraph after the bullets:

> The assistant writes its own SQL against the `documents` table. Every
> statement must parse as one read-only `SELECT` or `WITH`, runs inside a
> read-only transaction with a five second timeout, and returns at most 100 rows
> with the PDF bytes removed. This is a proof of concept: a production
> deployment would connect with a dedicated Postgres role limited to `SELECT` on
> `documents` instead of the app's migration-capable role.

- [ ] **Step 3: Update the changelog**

Under `## [Unreleased]` / `### Added`:

```
- Contract questions in the chat assistant: a `query_contracts` tool runs
  model-written, read-only SQL against the stored documents and answers from
  the rows.
```

- [ ] **Step 4: Run the five gates**

```sh
bun run format:check
bun run typecheck
bun run lint
bun run test
bun run build
```

Expected: Prettier reports every file formatted; tsc exits 0; eslint reports 0
problems with `--max-warnings 0`; every test passes; the bundle writes to
`dist/`.

- [ ] **Step 5: Confirm the read-only boundary is in place**

```sh
grep -q 'accessMode: "read only"' src/db/query.ts && echo read-only-transaction-ok
grep -q 'statement_timeout' src/db/query.ts && echo timeout-ok
```

- [ ] **Step 6: Commit and open the PR**

```sh
git add src/deps.ts README.md CHANGELOG.md
git commit -m "feat: answer contract questions from the documents table"
git push -u origin feat/contract-query-tool
gh pr create --base main --title "feat: contract query tool" --body "Adds a query_contracts tool so the chat assistant can read the stored contracts. Statements are parsed as a single read-only SELECT/WITH, run in a read-only transaction with a timeout, and capped at 100 rows. README notes the production read-only database role."
```
