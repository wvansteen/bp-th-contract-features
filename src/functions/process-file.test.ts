import { describe, expect, it } from "bun:test";
import { NonRetriableError, RetryAfterError } from "inngest";
import type { BoxClientPort } from "../box/client";
import type { DocumentStore } from "../db/document-store";
import { processFileHandler, type ProcessFileSteps } from "./process-file";

const passthroughSteps: ProcessFileSteps = {
  run: (_id, fn) => fn(),
};

const noopStore: DocumentStore = {
  upsert: () => Promise.resolve(undefined),
  listAll: () => Promise.resolve([]),
};

function boxDescribing(file: Record<string, unknown>): BoxClientPort {
  return {
    listFiles: () => Promise.reject(new Error("not used")),
    describeFile: () => Promise.resolve(file),
    downloadFile: () => Promise.reject(new Error("not used")),
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
      boxDescribing({ id: "777", name: "contract.pdf", size: 5000 }),
      passthroughSteps,
      noopStore,
      { fileId: "123" },
    );

    expect(result.documentId).toBe("123");
    expect(result.metadata.name).toBe("contract.pdf");
    expect(result.upserted).toEqual({
      documentId: "123",
      metadata: result.metadata,
    });
  });
});

describe("process-file error mapping", () => {
  it("passes a 404 through as non-retriable", async () => {
    const error = await processFileHandler(
      boxFailing(boxApiFailure(404)),
      passthroughSteps,
      noopStore,
      { fileId: "1" },
    ).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(NonRetriableError);
  });

  it("passes a 429 Retry-After of seconds through as seconds", async () => {
    const error = await processFileHandler(
      boxFailing(boxApiFailure(429, { "retry-after": "120" })),
      passthroughSteps,
      noopStore,
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
      { fileId: "1" },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBe(failure);
  });

  it("rethrows failures that are not Box API errors", async () => {
    const error = await processFileHandler(
      boxFailing(new TypeError("socket hang up")),
      passthroughSteps,
      noopStore,
      { fileId: "1" },
    ).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(TypeError);
  });
});
