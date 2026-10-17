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

  it("returns 422 when maxDocuments exceeds the per-request cap", async () => {
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
    // Set comparison, not an ordered one. Ordering is the Drizzle adapter's
    // contract and needs a real database to verify, not a fixed fake array.
    expect([...body].sort((a: any, b: any) => a.documentId.localeCompare(b.documentId))).toEqual([
      { documentId: "1", metadata: { name: "contract.pdf" } },
      { documentId: "2", metadata: { name: "nda.pdf" } },
    ]);
  });
});
