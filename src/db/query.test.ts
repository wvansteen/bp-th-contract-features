import { describe, expect, it } from "bun:test";
import {
  createContractQuery,
  toSingleReadOnlyStatement,
  type ReadOnlySqlExecutor,
} from "./query";

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

  it("rejects an unsafe statement without running it", () => {
    const executor: ReadOnlySqlExecutor = {
      inReadOnlyTransaction: () => Promise.reject(new Error("should not run")),
    };

    expect(
      createContractQuery(executor)("update documents set metadata = '{}'"),
    ).rejects.toThrow("Only SELECT and WITH statements are allowed");
  });
});
