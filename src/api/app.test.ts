import { describe, expect, it, mock } from "bun:test";
import type { ChatAgent } from "./chat/agent";
import type { DocumentStore, StoredDocumentSummary } from "./db/document-store";
import type { InngestEventSender } from "./deps";
import { createApi } from "./app";

const rows: StoredDocumentSummary[] = [
  {
    documentId: "d1",
    metadata: { name: "one.pdf" },
    smartFeatures: { renewal_term: "one year" },
  },
];

const store: DocumentStore = {
  upsert: () => Promise.resolve(undefined),
  listAll: () => Promise.resolve(rows),
};

const streamOf = (values: readonly string[]): AsyncIterable<string> => ({
  [Symbol.asyncIterator]: () => {
    const iterator = values[Symbol.iterator]();
    return { next: () => Promise.resolve(iterator.next()) };
  },
});

const agent: ChatAgent = () => streamOf(["Hel", "lo"]);

function makeApp(): {
  app: ReturnType<typeof createApi>;
  send: InngestEventSender["send"];
} {
  const send = mock(() => Promise.resolve(undefined));
  const app = createApi({
    inngest: { send },
    inngestHandler: () => Promise.resolve(new Response("inngest")),
    store,
    agent,
  });
  return { app, send };
}

const request = (path: string, init?: RequestInit): Request =>
  new Request(`http://localhost${path}`, init);

const json = (body: unknown, method: string): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("createApi", () => {
  it("serves contracts under /api", async () => {
    const { app } = makeApp();

    const response = await app.handle(request("/api/contracts"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(rows);
  });

  it("no longer serves /contracts", async () => {
    const { app } = makeApp();

    const response = await app.handle(request("/contracts"));

    expect(response.status).toBe(404);
  });

  it("queues a run under /api", async () => {
    const { app, send } = makeApp();

    const response = await app.handle(
      request("/api/process-contracts", json({ maxDocuments: 10 }, "POST")),
    );

    expect(response.status).toBe(201);
    expect(send).toHaveBeenCalledWith({
      name: "box/list.files",
      data: { maxDocuments: 10 },
    });
  });

  it("no longer serves /process-contracts", async () => {
    const { app } = makeApp();

    const response = await app.handle(
      request("/process-contracts", json({ maxDocuments: 10 }, "POST")),
    );

    expect(response.status).toBe(404);
  });

  it("rejects an out-of-range maxDocuments", async () => {
    const { app, send } = makeApp();

    const response = await app.handle(
      request("/api/process-contracts", json({ maxDocuments: 0 }, "POST")),
    );

    expect(response.status).toBe(422);
    expect(send).not.toHaveBeenCalled();
  });

  it("delegates /api/inngest", async () => {
    const { app } = makeApp();

    const get = await app.handle(request("/api/inngest"));
    expect(await get.text()).toBe("inngest");

    const put = await app.handle(request("/api/inngest", { method: "PUT" }));
    expect(await put.text()).toBe("inngest");
  });

  it("streams chat under /api", async () => {
    const { app } = makeApp();

    const response = await app.handle(
      request(
        "/api/chat",
        json({ messages: [{ role: "user", text: "hi" }] }, "POST"),
      ),
    );

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toBe(
      'data: {"text":"Hel"}\n\ndata: {"text":"lo"}\n\n',
    );
  });

  it("404s unknown /api paths", async () => {
    const { app } = makeApp();

    const response = await app.handle(request("/api/nope"));

    expect(response.status).toBe(404);
  });
});
