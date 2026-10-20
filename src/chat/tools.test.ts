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
