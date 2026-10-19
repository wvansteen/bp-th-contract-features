import { describe, expect, it } from "bun:test";
import { fileBytes } from "./download";

const url = "https://api.box.com/2.0/files/123/content";

describe("fileBytes", () => {
  it("returns the downloaded bytes", async () => {
    const bytes = await fileBytes({
      url,
      fetchResponse: () =>
        Promise.resolve(new Response(new Uint8Array([37, 80, 68, 70]))),
    });

    expect(bytes).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("rejects when the file is not ready yet", () => {
    expect(
      fileBytes({
        url,
        fetchResponse: () =>
          Promise.resolve(new Response(null, { status: 202 })),
      }),
    ).rejects.toThrow("status 202");
  });

  it("rejects on an error status", () => {
    expect(
      fileBytes({
        url,
        fetchResponse: () =>
          Promise.resolve(new Response("forbidden", { status: 403 })),
      }),
    ).rejects.toThrow("status 403");
  });
});
