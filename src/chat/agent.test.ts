import { describe, expect, it } from "bun:test";
import { createChatAgent, SYSTEM_PROMPT } from "./agent";
import type { OpenRouterClientPort } from "../openrouter/client";

const deltas = (chunks: readonly string[]): AsyncIterable<string> => {
  const iterator = chunks[Symbol.iterator]();
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve(iterator.next()),
    }),
  };
};

describe("createChatAgent", () => {
  it("pins the system prompt copy", () => {
    expect(SYSTEM_PROMPT).toBe(
      "You are the Contract Investigation assistant for Lake County, Illinois. Answer questions in plain language. You cannot read the county's contract documents yourself in this version, so answer from what the conversation contains and say plainly when you do not know.",
    );
  });

  it("prepends the system prompt and maps deep-chat roles to model turns", async () => {
    const client: OpenRouterClientPort = {
      complete: () => Promise.reject(new Error("not used")),
      chatTextStream: (input) =>
        deltas([input.messages.map((m) => `${m.role}:${m.content}`).join("|")]),
    };
    const agent = createChatAgent({
      client,
      model: "deepseek/deepseek-v4.1-flash-1017",
    });

    const first = await agent({
      messages: [
        { role: "user", text: "hi" },
        { role: "ai", text: "hello" },
        { role: "user", text: "again" },
      ],
    })
      [Symbol.asyncIterator]()
      .next();

    expect(first.value).toBe(
      `system:${SYSTEM_PROMPT}|user:hi|assistant:hello|user:again`,
    );
  });

  it("passes the model id through", async () => {
    const client: OpenRouterClientPort = {
      complete: () => Promise.reject(new Error("not used")),
      chatTextStream: (input) => deltas([input.model]),
    };
    const agent = createChatAgent({
      client,
      model: "deepseek/deepseek-v4.1-flash-1017",
    });

    const first = await agent({
      messages: [{ role: "user", text: "hi" }],
    })
      [Symbol.asyncIterator]()
      .next();

    expect(first.value).toBe("deepseek/deepseek-v4.1-flash-1017");
  });

  it("yields the reply deltas unchanged", async () => {
    const agent = createChatAgent({
      client: {
        complete: () => Promise.reject(new Error("not used")),
        chatTextStream: () => deltas(["Hel", "lo"]),
      },
      model: "deepseek/deepseek-v4.1-flash-1017",
    });

    const iterator = agent({
      messages: [{ role: "user", text: "hi" }],
    })[Symbol.asyncIterator]();

    expect((await iterator.next()).value).toBe("Hel");
    expect((await iterator.next()).value).toBe("lo");
    expect((await iterator.next()).done).toBe(true);
  });
});
