import { describe, expect, it } from "bun:test";
import { NonRetriableError, RetryAfterError } from "inngest";
import { BoxApiError } from "box-node-sdk";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore, StoredDocument } from "../db/document-store";
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
    await processFileHandler(fakeBox({ id: "9" }), steps, store, {
      fileId: "9",
    });
    await processFileHandler(fakeBox({ id: "9" }), steps, store, {
      fileId: "9",
    });

    // Conflict handling is the adapter's job, which is what makes redelivery
    // safe. The port exposes no insert path at all.
    expect(calls).toEqual(["9", "9"]);
  });

  it("separates the describe and upsert into distinct steps", async () => {
    const { steps, stepIds } = fakeSteps();
    const store: DocumentStore = {
      async upsert() {},
      async listAll() {
        return [];
      },
    };

    await processFileHandler(fakeBox({ id: "5" }), steps, store, {
      fileId: "5",
    });

    expect(stepIds).toEqual(["describe-file", "upsert"]);
  });

  it("stores the described metadata and keys the row on the event fileId", async () => {
    const upserts: StoredDocument[] = [];
    const store: DocumentStore = {
      async upsert(doc) {
        upserts.push(doc);
      },
      async listAll() {
        return [];
      },
    };

    const { steps } = fakeSteps();
    // The described id deliberately differs from the event's fileId, so the two
    // possible sources of documentId cannot be confused for one another.
    await processFileHandler(
      fakeBox({ id: "server-side-id", name: "contract.pdf", size: 5000 }),
      steps,
      store,
      { fileId: "event-file-id" },
    );

    expect(upserts).toEqual([
      {
        documentId: "event-file-id",
        metadata: { id: "server-side-id", name: "contract.pdf", size: 5000 },
      },
    ]);
  });
});

describe("process-file error mapping", () => {
  function boxApiError(status: number, headers: Record<string, string> = {}) {
    return new BoxApiError({
      message: `Box API error: ${status}`,
      requestInfo: {
        method: "GET",
        url: "https://api.box.com/2.0/files/1",
        queryParams: {},
        headers: {},
      },
      responseInfo: { statusCode: status, headers },
    });
  }

  function failingBox(error: Error) {
    return {
      async listFiles() {
        throw new Error("not used");
      },
      async describeFile() {
        throw error;
      },
    } satisfies BoxClientPort;
  }

  // `RetryAfterError` divides whatever it is given by 1000 and stores the
  // result as a string of seconds, which is why the field is typed `string`.
  // So 120_000 ms is stored as "120".
  function retryAfterSeconds(error: unknown): string {
    return (error as RetryAfterError).retryAfter;
  }

  const noStore: DocumentStore = {
    async upsert() {
      throw new Error("upsert must not run when describe fails");
    },
    async listAll() {
      return [];
    },
  };

  it("makes a 404 non-retriable, since a deleted file will not come back", async () => {
    const { steps } = fakeSteps();

    await expect(
      processFileHandler(failingBox(boxApiError(404)), steps, noStore, {
        fileId: "1",
      }),
    ).rejects.toThrow(NonRetriableError);
  });

  it("passes a 429 Retry-After of seconds through as seconds", async () => {
    const { steps } = fakeSteps();
    const error = await processFileHandler(
      failingBox(boxApiError(429, { "retry-after": "120" })),
      steps,
      noStore,
      { fileId: "1" },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RetryAfterError);
    expect(retryAfterSeconds(error)).toBe("120");
  });

  it("falls back to a 60s wait when Retry-After is an HTTP-date", async () => {
    const { steps } = fakeSteps();
    const error = await processFileHandler(
      failingBox(
        boxApiError(429, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }),
      ),
      steps,
      noStore,
      { fileId: "1" },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RetryAfterError);
    // parseInt on a date is NaN, and a NaN retryAfter retries immediately.
    expect(retryAfterSeconds(error)).toBe("60");
  });

  it("rethrows a 429 that carries no Retry-After", async () => {
    const { steps } = fakeSteps();

    await expect(
      processFileHandler(failingBox(boxApiError(429)), steps, noStore, {
        fileId: "1",
      }),
    ).rejects.toBeInstanceOf(BoxApiError);
  });

  it("rethrows a 5xx so Inngest retries it", async () => {
    const { steps } = fakeSteps();

    await expect(
      processFileHandler(failingBox(boxApiError(503)), steps, noStore, {
        fileId: "1",
      }),
    ).rejects.toBeInstanceOf(BoxApiError);
  });

  it("rethrows a non-Box error unchanged", async () => {
    const { steps } = fakeSteps();

    await expect(
      processFileHandler(
        failingBox(new Error("socket hang up")),
        steps,
        noStore,
        { fileId: "1" },
      ),
    ).rejects.toThrow("socket hang up");
  });
});
