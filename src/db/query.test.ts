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
