import { describe, expect, it } from "bun:test";
import type { BoxClientPort, BoxFileEntry, BoxPage } from "../box/client";
import { listFilesHandler, type ListFilesSteps } from "./list-files";

const folder = { folderId: "123", maxDocuments: 10 };

function file(id: string): BoxFileEntry {
  return { id, type: "file", name: `${id}.pdf` };
}

function page(entries: BoxFileEntry[], totalCount: number): BoxPage {
  return { entries, totalCount };
}

function filesFrom(start: number, count: number): BoxFileEntry[] {
  return Array.from({ length: count }, (_value, index) =>
    file(String(start + index)),
  );
}

function boxWithPages(pages: Record<number, BoxPage>): BoxClientPort {
  return {
    listFiles: ({ offset }) =>
      Promise.resolve(pages[offset] ?? { entries: [], totalCount: 0 }),
    describeFile: () => {
      throw new Error("not used");
    },
    downloadFile: () => Promise.reject(new Error("not used")),
  };
}

const passthroughSteps: ListFilesSteps = {
  run: (_id, fn) => fn(),
  sendEvent: () => Promise.resolve(undefined),
};

describe("list-files", () => {
  it("emits one box/process.file per file on a single page", async () => {
    const result = await listFilesHandler(
      boxWithPages({ 0: page([file("1"), file("2")], 2) }),
      passthroughSteps,
      folder,
    );

    expect(result.emitted.map((e) => e.data.fileId)).toEqual(["1", "2"]);
    expect(result.emitted.every((e) => e.name === "box/process.file")).toBe(
      true,
    );
  });

  it("gives every event a stable id", async () => {
    const result = await listFilesHandler(
      boxWithPages({ 0: page([file("7")], 1) }),
      passthroughSteps,
      folder,
    );

    expect(result.emitted[0]?.id).toBe("box/process.file/7");
  });

  it("caps total processed files across pages, not per page", async () => {
    const result = await listFilesHandler(
      boxWithPages({
        0: page([file("1"), file("2")], 400),
        100: page([file("3"), file("4")], 400),
        200: page([file("5"), file("6")], 400),
      }),
      passthroughSteps,
      { folderId: "123", maxDocuments: 3 },
    );

    expect(result.emitted.map((e) => e.data.fileId)).toEqual(["1", "2", "3"]);
  });

  it("stops fetching once the cap is reached", async () => {
    const result = await listFilesHandler(
      boxWithPages({
        0: page(filesFrom(1, 100), 400),
        100: page(filesFrom(101, 100), 400),
        200: page(filesFrom(201, 100), 400),
        300: page(filesFrom(301, 100), 400),
      }),
      passthroughSteps,
      { folderId: "123", maxDocuments: 100 },
    );

    expect(result.pagesFetched).toEqual([0]);
    expect(result.emitted).toHaveLength(100);
  });

  it("walks every page when the folder is larger than one page", async () => {
    const result = await listFilesHandler(
      boxWithPages({
        0: page([file("1")], 250),
        100: page([file("2")], 250),
        200: page([file("3")], 250),
      }),
      passthroughSteps,
      folder,
    );

    expect(result.pagesFetched).toEqual([0, 100, 200]);
  });

  it("stops correctly when totalCount is not a multiple of page size", async () => {
    const result = await listFilesHandler(
      boxWithPages({
        0: page([file("1"), file("2")], 101),
        100: page([file("3")], 101),
      }),
      passthroughSteps,
      folder,
    );

    expect(result.pagesFetched).toEqual([0, 100]);
  });

  it("emits nothing and does not hang for an empty folder", async () => {
    const result = await listFilesHandler(
      boxWithPages({ 0: page([], 0) }),
      passthroughSteps,
      folder,
    );

    expect(result.emitted).toEqual([]);
    expect(result.pagesFetched).toEqual([0]);
  });

  it("filters out folders and web links", async () => {
    const result = await listFilesHandler(
      boxWithPages({
        0: page(
          [
            { id: "f1", type: "folder", name: "subfolder" },
            { id: "w1", type: "web_link", name: "link" },
            file("1"),
          ],
          3,
        ),
      }),
      passthroughSteps,
      folder,
    );

    expect(result.emitted.map((e) => e.data.fileId)).toEqual(["1"]);
  });

  it("rejects a malformed entry shape rather than throwing from filter", async () => {
    const malformedSteps: ListFilesSteps = {
      run: () => Promise.resolve({ entries: [{}], totalCount: 1 }),
      sendEvent: () => Promise.resolve(undefined),
    };

    const failure = await listFilesHandler(
      boxWithPages({}),
      malformedSteps,
      folder,
    ).catch((error: unknown) => error);

    expect(failure instanceof Error ? failure.message : undefined).toBe(
      "Box returned an unexpected page at offset 0",
    );
  });
});

describe("list-files replay safety", () => {
  function cannedSteps(canned: Record<string, unknown>): ListFilesSteps {
    const resolve = (id: string): Promise<unknown> =>
      id in canned
        ? Promise.resolve(canned[id])
        : Promise.reject(new Error(`no canned result for ${id}`));

    return {
      run: (id) => resolve(id),
      sendEvent: (id) => resolve(id),
    };
  }

  const box = boxWithPages({
    0: page([file("1"), file("2")], 201),
    100: page([file("3"), file("4")], 201),
    200: page([file("5")], 201),
  });

  const params = { folderId: "1", maxDocuments: 10 };

  it("rebuilds the walk from memoized step results", async () => {
    const partial = {
      "page-0": page([file("1"), file("2")], 201),
      "emit-0": { ids: ["a", "b"] },
    };
    const failure = await listFilesHandler(
      box,
      cannedSteps(partial),
      params,
    ).catch((error: unknown) => error);

    expect(failure instanceof Error ? failure.message : undefined).toBe(
      "no canned result for page-100",
    );

    const full = {
      "page-0": page([file("1"), file("2")], 201),
      "emit-0": { ids: ["a", "b"] },
      "page-100": page([file("3"), file("4")], 201),
      "emit-100": { ids: ["c", "d"] },
      "page-200": page([file("5")], 201),
      "emit-200": { ids: ["e"] },
    };
    const result = await listFilesHandler(box, cannedSteps(full), params);

    expect(result.pagesFetched).toEqual([0, 100, 200]);
    expect(result.emitted.map((e) => e.data.fileId)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
  });
});
