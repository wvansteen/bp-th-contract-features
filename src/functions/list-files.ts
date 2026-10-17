import type { BoxClientPort, BoxPage } from "../box/client";

export type SentEvent = { id: string; name: string; data: { fileId: string } };

export type ListFilesSteps = {
  run(id: string, fn: () => Promise<BoxPage>): Promise<BoxPage>;
  sendEvent(id: string, events: SentEvent[]): Promise<{ ids: string[] }>;
};

const PAGE_SIZE = 100;

export async function listFilesHandler(
  box: BoxClientPort,
  steps: ListFilesSteps,
  params: { folderId: string; maxDocuments: number },
): Promise<void> {
  const { folderId, maxDocuments } = params;

  let offset = 0;
  let processed = 0;

  while (processed < maxDocuments) {
    const page = await steps.run(`page-${offset}`, () =>
      box.listFiles({ folderId, offset, limit: PAGE_SIZE }),
    );

    // Box folder listings mix files, subfolders, and web links. Only files
    // have metadata worth storing, and only files can be described by id.
    const files = page.entries.filter((entry) => entry.type === "file");
    const batch = files.slice(0, maxDocuments - processed);

    if (batch.length > 0) {
      await steps.sendEvent(
        `emit-${offset}`,
        batch.map((file) => ({
          id: `box/process.file/${file.id}`,
          name: "box/process.file",
          data: { fileId: file.id },
        })),
      );
    }

    processed += batch.length;

    // The cap was reached part-way through this page.
    if (batch.length < files.length) break;

    // Last page. `totalCount` counts every entry type, so compare against the
    // offset we have walked rather than against `files.length`.
    if (offset + PAGE_SIZE >= page.totalCount) break;

    offset += PAGE_SIZE;
  }
}
