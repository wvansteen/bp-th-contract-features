import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { createDbClient } from "./client";
import { createDrizzleDocumentStore } from "./document-store";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://bp:bp@localhost:5432/contracts";

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
