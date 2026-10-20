import { parse } from "pgsql-ast-parser";
import { sql } from "drizzle-orm";
import type { DrizzleDb } from "./client";

const ROW_LIMIT = 101;

const MAX_ROWS = ROW_LIMIT - 1;

const READ_STATEMENT_TYPES: readonly string[] = [
  "select",
  "union",
  "union all",
  "values",
  "with",
  "with recursive",
];

const WRITE_NODE_TYPES: readonly string[] = ["insert", "update", "delete"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function hasWriteNode(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((element: unknown) => hasWriteNode(element));
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(([key, child]) =>
    key === "type"
      ? WRITE_NODE_TYPES.includes(String(child))
      : hasWriteNode(child),
  );
}

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
    const guarded = toSingleReadOnlyStatement(statement);
    const rows = await executor.inReadOnlyTransaction((execute) =>
      execute(guarded),
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
