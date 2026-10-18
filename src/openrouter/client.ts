import { OpenRouter } from "@openrouter/sdk";
import type { ChatMessages, ChatStreamChunk } from "@openrouter/sdk/models";

export type CompletionInput = {
  model: string;
  prompt: string;
  attachment?: { filename: string; bytes: Uint8Array };
};

export type ChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatInput = { model: string; messages: readonly ChatTurn[] };

export interface OpenRouterClientPort {
  complete(input: CompletionInput): Promise<string>;
  chatTextStream(input: ChatInput): AsyncIterable<string>;
}

// Role branch narrows the SDK union without a cast.
const toMessage = (turn: ChatTurn): ChatMessages =>
  turn.role === "assistant"
    ? { role: "assistant", content: turn.content }
    : turn.role === "system"
      ? { role: "system", content: turn.content }
      : { role: "user", content: turn.content };

const textOf = (chunk: ChatStreamChunk): string =>
  chunk.choices[0]?.delta.content ?? "";

async function* textDeltas(
  chunks: AsyncIterator<ChatStreamChunk>,
): AsyncGenerator<string> {
  const next = await chunks.next();
  if (next.done) return;
  yield textOf(next.value);
  yield* textDeltas(chunks);
}

async function* streamText(
  client: OpenRouter,
  input: ChatInput,
): AsyncGenerator<string> {
  const completion = await client.chat.send({
    chatRequest: {
      model: input.model,
      stream: true,
      messages: input.messages.map(toMessage),
    },
  });

  if ("choices" in completion) {
    throw new Error(
      "OpenRouter returned a completion where a stream was expected",
    );
  }

  yield* textDeltas(completion[Symbol.asyncIterator]());
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
          reasoning: { effort: "none" },
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

    chatTextStream(input) {
      return streamText(client, input);
    },
  };
}
