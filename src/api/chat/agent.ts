import type {
  ChatStreamEvent,
  ChatTurn,
  OpenRouterClientPort,
  ToolCall,
} from "../openrouter/client";
import type { ChatTool } from "./tools";

export type ChatMessage = { role: "user" | "ai"; text: string };

export type ChatAgent = (input: {
  messages: readonly ChatMessage[];
}) => AsyncIterable<string>;

export const SYSTEM_PROMPT =
  "You are the Contract Investigation assistant for Lake County, Illinois. Answer questions in plain language. The county's contract documents are stored in the documents table; call the query_contracts tool to read them, and answer from its results. When the results do not answer the question, say so plainly instead of guessing.";

const MAX_TOOL_ROUNDS = 3;

async function* round(
  events: AsyncIterator<ChatStreamEvent>,
  calls: readonly ToolCall[],
): AsyncGenerator<string, readonly ToolCall[]> {
  const next = await events.next();
  if (next.done) return calls;
  if (next.value.type === "toolCalls") {
    return yield* round(events, next.value.calls);
  }
  yield next.value.text;
  return yield* round(events, calls);
}

const runTool = (
  tools: readonly ChatTool[],
  call: ToolCall,
): Promise<string> => {
  const tool = tools.find(
    (candidate) => candidate.definition.name === call.name,
  );
  return tool
    ? tool.run(call.arguments)
    : Promise.resolve(JSON.stringify({ error: `Unknown tool ${call.name}` }));
};

async function* converse(
  deps: {
    client: OpenRouterClientPort;
    model: string;
    tools: readonly ChatTool[];
  },
  messages: readonly ChatTurn[],
  roundsLeft: number,
): AsyncGenerator<string> {
  const tools =
    roundsLeft === 0 ? undefined : deps.tools.map((tool) => tool.definition);

  const calls = yield* round(
    deps.client
      .chatStream({ model: deps.model, messages, tools })
      [Symbol.asyncIterator](),
    [],
  );

  if (roundsLeft === 0 || calls.length === 0) return;

  const results = await Promise.all(
    calls.map(async (call) => ({
      call,
      content: await runTool(deps.tools, call),
    })),
  );

  yield* converse(
    deps,
    [
      ...messages,
      { role: "assistant", content: "", toolCalls: calls },
      ...results.map(({ call, content }): ChatTurn => ({
        role: "tool",
        content,
        toolCallId: call.id,
      })),
    ],
    roundsLeft - 1,
  );
}

export const createChatAgent =
  ({
    client,
    model,
    tools,
  }: {
    client: OpenRouterClientPort;
    model: string;
    tools: readonly ChatTool[];
  }): ChatAgent =>
  ({ messages }) =>
    converse(
      { client, model, tools },
      [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((message): ChatTurn => ({
          role: message.role === "ai" ? "assistant" : "user",
          content: message.text,
        })),
      ],
      MAX_TOOL_ROUNDS,
    );
