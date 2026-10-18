import type { BoxClientPort, BoxFileEntry, BoxPage } from "../box/client";

export type SentEvent = { id: string; name: string; data: { fileId: string } };

export type ListFilesResult = {
  pagesFetched: readonly number[];
  emitted: readonly SentEvent[];
};

export type ListFilesSteps = {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>;
  sendEvent(id: string, events: SentEvent[]): Promise<unknown>;
};

const PAGE_SIZE = 100;

function isBoxEntry(value: unknown): value is BoxFileEntry {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value) || !("type" in value) || !("name" in value))
    return false;
  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.name === "string"
  );
}

function isBoxPage(value: unknown): value is BoxPage {
  if (typeof value !== "object" || value === null) return false;
  if (!("entries" in value) || !("totalCount" in value)) return false;
  return (
    Array.isArray(value.entries) &&
    typeof value.totalCount === "number" &&
    value.entries.every(isBoxEntry)
  );
}

async function walk(
  box: BoxClientPort,
  steps: ListFilesSteps,
  params: { folderId: string; maxDocuments: number },
  offset: number,
  processed: number,
  pages: readonly number[],
  emitted: readonly SentEvent[],
): Promise<ListFilesResult> {
  if (processed >= params.maxDocuments) {
    return { pagesFetched: pages, emitted };
  }

  const result = await steps.run(`page-${offset}`, () =>
    box.listFiles({ folderId: params.folderId, offset, limit: PAGE_SIZE }),
  );

  if (!isBoxPage(result)) {
    throw new Error(`Box returned an unexpected page at offset ${offset}`);
  }

  const files = result.entries.filter((entry) => entry.type === "file");
  const batch = files.slice(0, params.maxDocuments - processed);
  const events = batch.map((entry) => ({
    id: `box/process.file/${entry.id}`,
    name: "box/process.file",
    data: { fileId: entry.id },
  }));

  if (events.length > 0) {
    await steps.sendEvent(`emit-${offset}`, events);
  }

  const nextPages = [...pages, offset];
  const nextEmitted = [...emitted, ...events];
  const nextProcessed = processed + batch.length;

  if (batch.length < files.length) {
    return { pagesFetched: nextPages, emitted: nextEmitted };
  }

  if (offset + PAGE_SIZE >= result.totalCount) {
    return { pagesFetched: nextPages, emitted: nextEmitted };
  }

  return walk(
    box,
    steps,
    params,
    offset + PAGE_SIZE,
    nextProcessed,
    nextPages,
    nextEmitted,
  );
}

export async function listFilesHandler(
  box: BoxClientPort,
  steps: ListFilesSteps,
  params: { folderId: string; maxDocuments: number },
): Promise<ListFilesResult> {
  return walk(box, steps, params, 0, 0, [], []);
}
