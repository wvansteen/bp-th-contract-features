import { OpenRouter } from "@openrouter/sdk";
import type {
  ChatFunctionTool,
  ChatMessages,
  ChatStreamChunk,
  ChatToolCall,
} from "@openrouter/sdk/models";

export type CompletionInput = {
  model: string;
  prompt: string;
  attachment?: { filename: string; bytes: Uint8Array };
};

export type ToolCall = { id: string; name: string; arguments: string };

export type ChatTurn =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: readonly ToolCall[] }
  | { role: "tool"; content: string; toolCallId: string };

export type ChatToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "toolCalls"; calls: readonly ToolCall[] };

export type ToolCallFragment = {
  index: number;
  id?: string | undefined;
  name?: string | undefined;
  arguments?: string | undefined;
};

export type ToolCallBuilder = {
  index: number;
  id: string;
  name: string;
  arguments: string;
};

export type ChatInput = {
  model: string;
  messages: readonly ChatTurn[];
  tools?: readonly ChatToolDefinition[];
};

export interface OpenRouterClientPort {
  complete(input: CompletionInput): Promise<string>;
  chatStream(input: ChatInput): AsyncIterable<ChatStreamEvent>;
}

// Role branch narrows the SDK union without a cast.
export const toMessage = (turn: ChatTurn): ChatMessages => {
  if (turn.role === "assistant") {
    return {
      role: "assistant",
      content: turn.content,
      toolCalls: turn.toolCalls?.map((call): ChatToolCall => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }

  if (turn.role === "tool") {
    return { role: "tool", content: turn.content, toolCallId: turn.toolCallId };
  }

  if (turn.role === "system") {
    return { role: "system", content: turn.content };
  }

  return { role: "user", content: turn.content };
};

export const toTool = (definition: ChatToolDefinition): ChatFunctionTool => ({
  type: "function",
  function: {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
  },
});

// An existing index keeps the first non-empty id and name; arguments concatenate.
export const mergeToolCallFragments = (
  fragments: readonly ToolCallFragment[],
  builders: readonly ToolCallBuilder[],
): readonly ToolCallBuilder[] =>
  fragments.reduce((accumulated, fragment) => {
    const exists = accumulated.some(
      (builder) => builder.index === fragment.index,
    );

    if (!exists) {
      return [
        ...accumulated,
        {
          index: fragment.index,
          id: fragment.id ?? "",
          name: fragment.name ?? "",
          arguments: fragment.arguments ?? "",
        },
      ];
    }

    return accumulated.map((builder) =>
      builder.index === fragment.index
        ? {
            index: builder.index,
            id: builder.id === "" ? (fragment.id ?? "") : builder.id,
            name: builder.name === "" ? (fragment.name ?? "") : builder.name,
            arguments: builder.arguments + (fragment.arguments ?? ""),
          }
        : builder,
    );
  }, builders);

export const toToolCalls = (
  builders: readonly ToolCallBuilder[],
): readonly ToolCall[] =>
  builders.map((builder) => ({
    id: builder.id,
    name: builder.name,
    arguments: builder.arguments,
  }));

const textOf = (chunk: ChatStreamChunk): string =>
  chunk.choices[0]?.delta.content ?? "";

async function* streamEvents(
  chunks: AsyncIterator<ChatStreamChunk>,
  builders: readonly ToolCallBuilder[],
): AsyncGenerator<ChatStreamEvent> {
  const next = await chunks.next();

  if (next.done) {
    if (builders.length > 0) {
      yield { type: "toolCalls", calls: toToolCalls(builders) };
    }
    return;
  }

  const fragments: readonly ToolCallFragment[] =
    next.value.choices[0]?.delta.toolCalls?.map((call) => ({
      index: call.index,
      id: call.id,
      name: call.function?.name,
      arguments: call.function?.arguments,
    })) ?? [];

  yield { type: "text", text: textOf(next.value) };
  yield* streamEvents(chunks, mergeToolCallFragments(fragments, builders));
}

async function* streamChat(
  client: OpenRouter,
  input: ChatInput,
): AsyncGenerator<ChatStreamEvent> {
  const completion = await client.chat.send({
    chatRequest: {
      model: input.model,
      stream: true,
      messages: input.messages.map(toMessage),
      tools: input.tools?.map(toTool),
    },
  });

  if ("choices" in completion) {
    throw new Error(
      "OpenRouter returned a completion where a stream was expected",
    );
  }

  yield* streamEvents(completion[Symbol.asyncIterator](), []);
}

export function createOpenRouterClient({
  apiKey,
}: {
  apiKey: string;
}): OpenRouterClientPort {
  const client = new OpenRouter({ apiKey });

  return {
    async complete({ model, prompt, attachment }) {
      const completion = await client.chat.send({
        chatRequest: {
          model,
          temperature: 0,
          // Some endpoints mandate reasoning; "none" is rejected there.
          reasoning: { effort: "minimal" },
          messages: [
            {
              role: "user",
              content: attachment
                ? [
                    { type: "text", text: prompt },
                    {
                      type: "file",
                      file: {
                        filename: attachment.filename,
                        fileData: `data:application/pdf;base64,${Buffer.from(
                          attachment.bytes,
                        ).toString("base64")}`,
                      },
                    },
                  ]
                : [{ type: "text", text: prompt }],
            },
          ],
        },
      });

      if (!("choices" in completion)) {
        throw new Error(
          "OpenRouter returned a stream where a completion was expected",
        );
      }

      const content = completion.choices[0]?.message.content;

      if (typeof content === "string") return content;

      if (Array.isArray(content)) {
        return content
          .map((item) => ("text" in item ? item.text : ""))
          .join("");
      }

      return "";
    },

    chatStream(input) {
      return streamChat(client, input);
    },
  };
}
