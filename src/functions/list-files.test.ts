import { describe, expect, it } from "bun:test";
import type { BoxClientPort, BoxPage } from "../box/client";
import { listFilesHandler, type ListFilesSteps } from "./list-files";

type SentEvent = { id: string; name: string; data: { fileId: string } };

function fakeBox(pages: BoxPage[]): BoxClientPort & { calls: Array<{ offset: number; limit: number }> } {
  const calls: Array<{ offset: number; limit: number }> = [];
  return {
    calls,
    async listFiles({ offset, limit }) {
      calls.push({ offset, limit });
      return pages[Math.floor(offset / limit)] ?? { entries: [], totalCount: 0 };
    },
    async describeFile() {
      throw new Error("not used");
    },
  };
}

function fakeSteps(): { steps: ListFilesSteps; sent: SentEvent[]; stepIds: string[] } {
  const sent: SentEvent[] = [];
  const stepIds: string[] = [];
  const steps: ListFilesSteps = {
    async run(id, fn) {
      stepIds.push(id);
      return fn();
    },
    async sendEvent(id, events) {
      stepIds.push(id);
      sent.push(...events);
      return { ids: events.map(() => "evt") };
    },
  };
  return { steps, sent, stepIds };
}

const folder = { folderId: "123", maxDocuments: 10 };

describe("list-files", () => {
  it("emits one box/process.file per file on a single page", async () => {
    const box = fakeBox([
      {
        entries: [
          { id: "1", type: "file", name: "a.pdf" },
          { id: "2", type: "file", name: "b.pdf" },
        ],
        totalCount: 2,
      },
    ]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, folder);

    expect(sent).toHaveLength(2);
    expect(sent.map((e) => e.data.fileId)).toEqual(["1", "2"]);
    expect(sent.every((e) => e.name === "box/process.file")).toBe(true);
  });

  it("gives every event a stable id so redelivery cannot start a second run", async () => {
    const box = fakeBox([{ entries: [{ id: "7", type: "file", name: "a.pdf" }], totalCount: 1 }]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, folder);

    expect(sent[0].id).toBe("box/process.file/7");
  });

  it("caps total processed files across pages, not per page", async () => {
    const page = (ids: string[]): BoxPage => ({
      entries: ids.map((id) => ({ id, type: "file", name: `${id}.pdf` })),
      totalCount: 400,
    });
    const box = fakeBox([page(["1", "2"]), page(["3", "4"]), page(["5", "6"])]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, { folderId: "123", maxDocuments: 3 });

    expect(sent.map((e) => e.data.fileId)).toEqual(["1", "2", "3"]);
  });

  it("walks every page when the folder is larger than one page", async () => {
    const box = fakeBox([
      { entries: [{ id: "1", type: "file", name: "a.pdf" }], totalCount: 250 },
      { entries: [{ id: "2", type: "file", name: "b.pdf" }], totalCount: 250 },
      { entries: [{ id: "3", type: "file", name: "c.pdf" }], totalCount: 250 },
    ]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, { folderId: "123", maxDocuments: 10 });

    expect(sent.map((e) => e.data.fileId)).toEqual(["1", "2", "3"]);
    expect(box.calls.map((c) => c.offset)).toEqual([0, 100, 200]);
  });

  it("stops correctly when totalCount is not a multiple of page size", async () => {
    const box = fakeBox([
      {
        entries: [{ id: "1", type: "file", name: "a.pdf" }, { id: "2", type: "file", name: "b.pdf" }],
        totalCount: 101,
      },
      { entries: [{ id: "3", type: "file", name: "c.pdf" }], totalCount: 101 },
    ]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, { folderId: "123", maxDocuments: 10 });

    expect(sent.map((e) => e.data.fileId)).toEqual(["1", "2", "3"]);
    expect(box.calls).toHaveLength(2);
  });

  it("emits nothing and does not hang for an empty folder", async () => {
    const box = fakeBox([{ entries: [], totalCount: 0 }]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, { folderId: "123", maxDocuments: 10 });

    expect(sent).toHaveLength(0);
    expect(box.calls).toHaveLength(1);
  });

  it("filters out folders and web links", async () => {
    const box = fakeBox([
      {
        entries: [
          { id: "f1", type: "folder", name: "subfolder" },
          { id: "w1", type: "web_link", name: "link" },
          { id: "1", type: "file", name: "a.pdf" },
        ],
        totalCount: 3,
      },
    ]);
    const { steps, sent } = fakeSteps();

    await listFilesHandler(box, steps, { folderId: "123", maxDocuments: 10 });

    expect(sent.map((e) => e.data.fileId)).toEqual(["1"]);
  });
});

describe("list-files replay safety", () => {
  function replayingBox() {
    const calls: number[] = [];
    const box: BoxClientPort = {
      async listFiles({ offset }) {
        calls.push(offset);
        const ids = offset === 0 ? ["1", "2"] : offset === 100 ? ["3", "4"] : ["5"];
        return {
          entries: ids.map((id) => ({ id, type: "file", name: `${id}.pdf` })),
          totalCount: 201,
        };
      },
      async describeFile() {
        throw new Error("not used");
      },
    };
    return { box, calls };
  }

  function replayingSteps() {
    const memo = new Map<string, unknown>();
    const sentAll: SentEvent[] = [];
    let failOn: string | null = null;

    const steps: ListFilesSteps = {
      async run(id, fn) {
        if (memo.has(id)) return memo.get(id) as BoxPage;
        if (id === failOn) {
          failOn = null;
          throw new Error("transient failure");
        }
        const value = await fn();
        memo.set(id, value);
        return value;
      },
      async sendEvent(id, events) {
        if (memo.has(id)) return memo.get(id) as { ids: string[] };
        const out = { ids: events.map(() => "evt") };
        memo.set(id, out);
        sentAll.push(...events);
        return out;
      },
    };

    return { steps, sentAll, failOnceOn: (id: string) => { failOn = id; } };
  }

  it("rebuilds loop state from memoized steps after a mid-loop failure", async () => {
    const { box, calls } = replayingBox();
    const steps = replayingSteps();
    const params = { folderId: "1", maxDocuments: 10 };

    steps.failOnceOn("page-100");
    await expect(listFilesHandler(box, steps.steps, params)).rejects.toThrow(
      "transient failure",
    );

    // Second entry. `offset` and `processed` are back to 0.
    await listFilesHandler(box, steps.steps, params);

    // Each page was fetched exactly once despite the restart, because replay
    // walks the memoized prefix instead of re-running it.
    expect(calls).toEqual([0, 100, 200]);
    // And each page's fan-out was sent exactly once.
    expect(steps.sentAll.map((e) => e.data.fileId)).toEqual(["1", "2", "3", "4", "5"]);
  });
});
