import { describe, expect, it } from "bun:test";
import { NonRetriableError, RetryAfterError } from "inngest";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore, StoredDocument } from "../db/document-store";
import { processFileHandler, type ProcessFileSteps } from "./process-file";

const passthroughSteps: ProcessFileSteps = {
  run: (_id, fn) => fn(),
};

const noopStore: DocumentStore = {
  upsert: () => Promise.resolve(undefined),
  listAll: () => Promise.resolve([]),
};

function boxWithContent(
  file: Record<string, unknown>,
  bytes: Uint8Array,
): BoxClientPort {
  return {
    listFiles: () => Promise.reject(new Error("not used")),
    describeFile: () => Promise.resolve(file),
    downloadFile: () => Promise.resolve(bytes),
  };
}

function boxFailing(error: unknown): BoxClientPort {
  return {
    listFiles: () => Promise.reject(new Error("not used")),
    describeFile: () => {
      throw error;
    },
    downloadFile: () => Promise.reject(new Error("not used")),
  };
}

function boxApiFailure(
  status: number,
  headers: Record<string, string> = {},
): unknown {
  return { responseInfo: { statusCode: status, headers } };
}

function retryAfterOf(error: unknown): string | undefined {
  return error instanceof RetryAfterError ? error.retryAfter : undefined;
}

describe("process-file", () => {
  it("describes the file and upserts it", async () => {
    const result = await processFileHandler(
      boxWithContent(
        { id: "777", name: "contract.pdf", size: 5000 },
        new Uint8Array([1]),
      ),
      passthroughSteps,
      noopStore,
      () => Promise.resolve({}),
      { fileId: "123" },
    );

    expect(result).toEqual({
      documentId: "123",
      metadata: { id: "777", name: "contract.pdf", size: 5000 },
      smartFeatures: {},
      upserted: {
        documentId: "123",
        metadata: { id: "777", name: "contract.pdf", size: 5000 },
      },
    });
  });

  const rowAllowed = (row: StoredDocument): boolean =>
    row.document.length === 3 &&
    (Object.keys(row.smartFeatures).length === 0
      ? true
      : row.smartFeatures["Payment Terms"] === "20220920103554.pdf:3");

  const stagedStore: DocumentStore = {
    upsert: (row) =>
      rowAllowed(row)
        ? Promise.resolve(undefined)
        : Promise.reject(new Error("upsert received a partial row")),
    listAll: () => Promise.resolve([]),
  };

  it("downloads the file and stores the smart feature results", async () => {
    const result = await processFileHandler(
      boxWithContent(
        { id: "777", name: "20220920103554.pdf" },
        new Uint8Array([1, 2, 3]),
      ),
      passthroughSteps,
      stagedStore,
      ({ filename, document }) =>
        Promise.resolve({ "Payment Terms": `${filename}:${document.length}` }),
      { fileId: "123" },
    );

    expect(result).toEqual({
      documentId: "123",
      metadata: { id: "777", name: "20220920103554.pdf" },
      smartFeatures: { "Payment Terms": "20220920103554.pdf:3" },
      upserted: {
        documentId: "123",
        metadata: { id: "777", name: "20220920103554.pdf" },
      },
    });
  });

  it("stores the document even when no features are configured", async () => {
    const result = await processFileHandler(
      boxWithContent(
        { id: "777", name: "contract.pdf" },
        new Uint8Array([1, 2, 3]),
      ),
      passthroughSteps,
      stagedStore,
      () => Promise.resolve({}),
      { fileId: "123" },
    );

    expect(result).toEqual({
      documentId: "123",
      metadata: { id: "777", name: "contract.pdf" },
      smartFeatures: {},
      upserted: {
        documentId: "123",
        metadata: { id: "777", name: "contract.pdf" },
      },
    });
  });

  it("does not write smart features when classification fails", () => {
    const store: DocumentStore = {
      upsert: (row) =>
        Object.keys(row.smartFeatures).length === 0
          ? Promise.resolve(undefined)
          : Promise.reject(new Error("smart features must not be written")),
      listAll: () => Promise.resolve([]),
    };

    expect(
      processFileHandler(
        boxWithContent(
          { id: "777", name: "contract.pdf" },
          new Uint8Array([1, 2, 3]),
        ),
        passthroughSteps,
        store,
        () => Promise.reject(new Error("model unavailable")),
        { fileId: "123" },
      ),
    ).rejects.toThrow("model unavailable");
  });

  it("skips non-PDF files without writing a record", async () => {
    const store: DocumentStore = {
      upsert: () => Promise.reject(new Error("no record must be written")),
      listAll: () => Promise.resolve([]),
    };

    const box: BoxClientPort = {
      ...boxWithContent({ id: "777", name: "notes.txt" }, new Uint8Array([1])),
      downloadFile: () => Promise.reject(new Error("download must not run")),
    };

    const result = await processFileHandler(
      box,
      passthroughSteps,
      store,
      () => Promise.reject(new Error("classify must not run")),
      { fileId: "123" },
    );

    expect(result).toEqual({ documentId: "123", skipped: "not-a-pdf" });
  });
});

describe("process-file error mapping", () => {
  it("passes a 404 through as non-retriable", async () => {
    const error = await processFileHandler(
      boxFailing(boxApiFailure(404)),
      passthroughSteps,
      noopStore,
      () => Promise.resolve({}),
      { fileId: "1" },
    ).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(NonRetriableError);
  });

  it("passes a 429 Retry-After of seconds through as seconds", async () => {
    const error = await processFileHandler(
      boxFailing(boxApiFailure(429, { "retry-after": "120" })),
      passthroughSteps,
      noopStore,
      () => Promise.resolve({}),
      { fileId: "1" },
    ).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(RetryAfterError);
    expect(retryAfterOf(error)).toBe("120");
  });

  it("falls back to a 60s wait when Retry-After is an HTTP-date", async () => {
    const error = await processFileHandler(
      boxFailing(
        boxApiFailure(429, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }),
      ),
      passthroughSteps,
      noopStore,
      () => Promise.resolve({}),
      { fileId: "1" },
    ).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(RetryAfterError);
    expect(retryAfterOf(error)).toBe("60");
  });

  it("rethrows a 429 that carries no Retry-After", async () => {
    const failure = boxApiFailure(429);
    const error = await processFileHandler(
      boxFailing(failure),
      passthroughSteps,
      noopStore,
      () => Promise.resolve({}),
      { fileId: "1" },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBe(failure);
  });

  it("treats an empty Retry-After header as absent", async () => {
    const failure = boxApiFailure(429, { "retry-after": "" });
    const error = await processFileHandler(
      boxFailing(failure),
      passthroughSteps,
      noopStore,
      () => Promise.resolve({}),
      { fileId: "1" },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBe(failure);
  });

  it("rethrows failures that are not Box API errors", async () => {
    const error = await processFileHandler(
      boxFailing(new TypeError("socket hang up")),
      passthroughSteps,
      noopStore,
      () => Promise.resolve({}),
      { fileId: "1" },
    ).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(TypeError);
  });
});
