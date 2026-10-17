import { describe, expect, it } from "bun:test";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore } from "../db/document-store";
import { processFileHandler, type ProcessFileSteps } from "./process-file";

function fakeBox(file: Record<string, unknown>): BoxClientPort {
  return {
    async listFiles() {
      throw new Error("not used");
    },
    async describeFile() {
      return file;
    },
  };
}

function fakeSteps(): { steps: ProcessFileSteps; stepIds: string[] } {
  const stepIds: string[] = [];
  const steps: ProcessFileSteps = {
    async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
      stepIds.push(id);
      return fn();
    },
  };
  return { steps, stepIds };
}

describe("process-file", () => {
  it("describes the file and upserts it", async () => {
    const store: DocumentStore & { upserts: Array<{ documentId: string }> } = {
      upserts: [],
      async upsert(doc) {
        this.upserts.push({ documentId: doc.documentId });
      },
      async listAll() {
        return [];
      },
    };

    const { steps } = fakeSteps();
    await processFileHandler(
      fakeBox({ id: "123", name: "contract.pdf", size: 5000 }),
      steps,
      store,
      { fileId: "123" },
    );

    expect(store.upserts).toHaveLength(1);
    expect(store.upserts[0].documentId).toBe("123");
  });

  it("writes through upsert only, so a redelivered event cannot duplicate a row", async () => {
    const calls: string[] = [];
    const store: DocumentStore = {
      async upsert(doc) {
        calls.push(doc.documentId);
      },
      async listAll() {
        return [];
      },
    };

    const { steps } = fakeSteps();
    await processFileHandler(fakeBox({ id: "9" }), steps, store, { fileId: "9" });
    await processFileHandler(fakeBox({ id: "9" }), steps, store, { fileId: "9" });

    expect(calls).toEqual(["9", "9"]);
    expect(Object.keys(store).sort()).toEqual(["listAll", "upsert"]);
  });

  it("separates the describe and upsert into distinct steps", async () => {
    const { steps, stepIds } = fakeSteps();
    const store: DocumentStore = {
      async upsert() {},
      async listAll() {
        return [];
      },
    };

    await processFileHandler(fakeBox({ id: "5" }), steps, store, { fileId: "5" });

    expect(stepIds).toEqual(["describe-file", "upsert"]);
  });
});
