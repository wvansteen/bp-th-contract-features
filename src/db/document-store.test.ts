import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDbClient } from "./client";
import type { DrizzleDb } from "./client";
import {
  createDrizzleDocumentStore,
  type DocumentStore,
} from "./document-store";

// The tests need a real Postgres but must never touch the developer's
// `contracts` database, so each run creates a throwaway database from this
// URL's server, migrates it, and drops it again.
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://bp:bp@localhost:5432/contracts";

function urlFor(database: string): string {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

const testDatabase = `contracts_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const maintenanceClient = postgres(urlFor("postgres"), { max: 1 });

let db: DrizzleDb;
let client: ReturnType<typeof createDbClient>["client"];
let store: DocumentStore;

beforeAll(async () => {
  await maintenanceClient.unsafe(`CREATE DATABASE "${testDatabase}"`);
  ({ db, client } = createDbClient(urlFor(testDatabase)));
  await migrate(db, { migrationsFolder: `${import.meta.dir}/../../drizzle` });
  store = createDrizzleDocumentStore(db);
});

afterAll(async () => {
  await client.end();
  await maintenanceClient.unsafe(
    `DROP DATABASE IF EXISTS "${testDatabase}" WITH (FORCE)`,
  );
  await maintenanceClient.end();
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
