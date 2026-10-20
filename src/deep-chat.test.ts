import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { deepChatAssets } from "./deep-chat";

describe("deepChatAssets", () => {
  it("returns a plugin for the assets directory", async () => {
    const plugin = await deepChatAssets("node_modules/deep-chat/dist");

    expect(plugin).toBeInstanceOf(Elysia);
  });
});
