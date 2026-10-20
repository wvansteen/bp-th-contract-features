import { describe, expect, it } from "bun:test";
import {
  mergeToolCallFragments,
  toMessage,
  toTool,
  toToolCalls,
} from "./client";

describe("toMessage", () => {
  it("maps an assistant turn with tool calls", () => {
    expect(
      toMessage({
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_1",
            name: "query_contracts",
            arguments: '{"sql":"select 1"}',
          },
        ],
      }),
    ).toEqual({
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "query_contracts",
            arguments: '{"sql":"select 1"}',
          },
        },
      ],
    });
  });

  it("maps a tool result turn", () => {
    expect(
      toMessage({ role: "tool", content: "{}", toolCallId: "call_1" }),
    ).toEqual({
      role: "tool",
      content: "{}",
      toolCallId: "call_1",
    });
  });
});

describe("toTool", () => {
  it("wraps a definition as a function tool", () => {
    expect(
      toTool({
        name: "query_contracts",
        description: "read docs",
        parameters: { type: "object" },
      }),
    ).toEqual({
      type: "function",
      function: {
        name: "query_contracts",
        description: "read docs",
        parameters: { type: "object" },
      },
    });
  });
});

describe("mergeToolCallFragments", () => {
  it("joins argument fragments by index", () => {
    const start = mergeToolCallFragments(
      [
        {
          index: 0,
          id: "call_1",
          name: "query_contracts",
          arguments: '{"sql":',
        },
      ],
      [],
    );
    const merged = mergeToolCallFragments(
      [{ index: 0, arguments: '"select 1"}' }],
      start,
    );

    expect(toToolCalls(merged)).toEqual([
      {
        id: "call_1",
        name: "query_contracts",
        arguments: '{"sql":"select 1"}',
      },
    ]);
  });

  it("keeps separate calls apart", () => {
    const builders = mergeToolCallFragments(
      [
        { index: 0, id: "call_1", name: "a", arguments: "1" },
        { index: 1, id: "call_2", name: "b", arguments: "2" },
      ],
      [],
    );

    expect(toToolCalls(builders)).toEqual([
      { id: "call_1", name: "a", arguments: "1" },
      { id: "call_2", name: "b", arguments: "2" },
    ]);
  });
});
