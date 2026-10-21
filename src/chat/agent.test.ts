import { describe, expect, it } from "bun:test";
import type {
  ChatStreamEvent,
  OpenRouterClientPort,
} from "../openrouter/client";
import { createChatAgent, type ChatMessage } from "./agent";
import type { ChatTool } from "./tools";

const streamOf = (
  events: readonly ChatStreamEvent[],
): AsyncIterable<ChatStreamEvent> => ({
  [Symbol.asyncIterator]: () => {
    const iterator = events[Symbol.iterator]();
    return { next: () => Promise.resolve(iterator.next()) };
  },
});

const drain = async (iterator: AsyncIterator<string>): Promise<string> => {
  const next = await iterator.next();
  return next.done ? "" : next.value + (await drain(iterator));
};

const scriptedClient = (
  rounds: readonly (readonly ChatStreamEvent[])[],
): OpenRouterClientPort => ({
  complete: () => Promise.reject(new Error("not used")),
  chatStream: (input) =>
    streamOf(
      rounds[input.messages.filter((m) => m.role === "assistant").length] ?? [],
    ),
});

const model = "deepseek/deepseek-v4.1-flash-1017";
const ask = (text: string): readonly ChatMessage[] => [{ role: "user", text }];
const text = (...parts: readonly string[]): readonly ChatStreamEvent[] =>
  parts.map((part) => ({ type: "text", text: part }));

const toolCall = (id: string, name: string, args: string): ChatStreamEvent => ({
  type: "toolCalls",
  calls: [{ id, name, arguments: args }],
});

const echoTool = (result: string): ChatTool => ({
  definition: { name: "query_contracts", description: "", parameters: {} },
  run: () => Promise.resolve(result),
});

const collect = (reply: AsyncIterable<string>): Promise<string> =>
  drain(reply[Symbol.asyncIterator]());

describe("createChatAgent", () => {
  it("streams the model's text", async () => {
    const agent = createChatAgent({
      client: scriptedClient([text("Hello", " there")]),
      model,
      tools: [],
    });

    expect(await collect(agent({ messages: ask("hi") }))).toBe("Hello there");
  });

  it("runs the tool and sends its result back", async () => {
    const toolResult = JSON.stringify({
      rows: [{ document_id: "abc" }],
      truncated: false,
    });
    const rounds: readonly (readonly ChatStreamEvent[])[] = [
      [toolCall("call_1", "query_contracts", '{"sql":"select 1"}')],
      [{ type: "text", text: "Found one." }],
    ];
    const client: OpenRouterClientPort = {
      complete: () => Promise.reject(new Error("not used")),
      chatStream: (input) => {
        const answered = input.messages.filter(
          (m) => m.role === "assistant",
        ).length;
        if (answered === 0) {
          expect(input.tools).toEqual([echoTool(toolResult).definition]);
        }
        if (answered === 1) {
          expect(input.messages.slice(-2)).toEqual([
            {
              role: "assistant",
              content: "",
              toolCalls: [
                {
                  id: "call_1",
                  name: "query_contracts",
                  arguments: '{"sql":"select 1"}',
                },
              ],
            },
            { role: "tool", content: toolResult, toolCallId: "call_1" },
          ]);
        }
        return streamOf(rounds[answered] ?? []);
      },
    };
    const agent = createChatAgent({
      client,
      model,
      tools: [echoTool(toolResult)],
    });

    expect(await collect(agent({ messages: ask("what contracts?") }))).toBe(
      "Found one.",
    );
  });

  it("reports an unknown tool to the model", async () => {
    const client: OpenRouterClientPort = {
      complete: () => Promise.reject(new Error("not used")),
      chatStream: (input) => {
        const answered = input.messages.filter(
          (m) => m.role === "assistant",
        ).length;
        if (answered === 1) {
          expect(input.messages[input.messages.length - 1]).toEqual({
            role: "tool",
            content: JSON.stringify({ error: "Unknown tool nope" }),
            toolCallId: "call_1",
          });
        }
        return streamOf(
          answered === 0
            ? [toolCall("call_1", "nope", "{}")]
            : [{ type: "text", text: "Sorry." }],
        );
      },
    };
    const agent = createChatAgent({ client, model, tools: [] });

    expect(await collect(agent({ messages: ask("hi") }))).toBe("Sorry.");
  });

  it("stops after three tool rounds", async () => {
    const rounds = [
      [toolCall("call_1", "query_contracts", "{}")],
      [toolCall("call_2", "query_contracts", "{}")],
      [toolCall("call_3", "query_contracts", "{}")],
      text("Out of attempts."),
    ];
    const client: OpenRouterClientPort = {
      complete: () => Promise.reject(new Error("not used")),
      chatStream: (input) => {
        const answered = input.messages.filter(
          (m) => m.role === "assistant",
        ).length;
        if (answered === 3) expect(input.tools).toBeUndefined();
        return streamOf(rounds[answered] ?? []);
      },
    };
    const agent = createChatAgent({ client, model, tools: [echoTool("{}")] });

    expect(await collect(agent({ messages: ask("hi") }))).toBe(
      "Out of attempts.",
    );
  });
});
