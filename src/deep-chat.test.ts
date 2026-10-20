import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { deepChatAssets } from "./deep-chat";

describe("deepChatAssets", () => {
  it("returns an empty plugin when the assets directory is missing", async () => {
    const plugin = await deepChatAssets("node_modules/deep-chat/missing");

    expect(plugin).toBeInstanceOf(Elysia);
  });

  it("returns a plugin when the assets directory exists", async () => {
    const plugin = await deepChatAssets("node_modules/deep-chat/dist");

    expect(plugin).toBeInstanceOf(Elysia);
  });
});
