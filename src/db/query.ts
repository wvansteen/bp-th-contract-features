import { parse } from "pgsql-ast-parser";

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
