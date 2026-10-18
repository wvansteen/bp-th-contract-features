import type { BoxClientPort, BoxPage } from "../box/client";

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

// Step results are JSON round-tripped between attempts, so their shape cannot
// be trusted from the type alone. A mismatch is an error rather than a silent
// truncation of the walk.
function isBoxPage(value: unknown): value is BoxPage {
  if (typeof value !== "object" || value === null) return false;
  if (!("entries" in value) || !("totalCount" in value)) return false;
  return Array.isArray(value.entries) && typeof value.totalCount === "number";
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
  // The cap is the walk's entry condition, mirroring the pre-rewrite
  // `while (processed < maxDocuments)`. Without it a cap landing exactly on a
  // page boundary would fetch one extra page before the inner stops fire.
  if (processed >= params.maxDocuments) {
    return { pagesFetched: pages, emitted };
  }

  const result = await steps.run(`page-${offset}`, () =>
    box.listFiles({ folderId: params.folderId, offset, limit: PAGE_SIZE }),
  );

  if (!isBoxPage(result)) {
    throw new Error(`Box returned an unexpected page at offset ${offset}`);
  }

  // Box folder listings mix files, subfolders, and web links. Only files have
  // metadata worth storing, and only files can be described by id.
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

  // The cap was reached part-way through this page.
  if (batch.length < files.length) {
    return { pagesFetched: nextPages, emitted: nextEmitted };
  }

  // Last page. `totalCount` counts every entry type, so compare against the
  // offset we have walked rather than against `files.length`.
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
