import type {
  ChatStreamEvent,
  ChatTurn,
  OpenRouterClientPort,
} from "../openrouter/client";

export type ChatMessage = { role: "user" | "ai"; text: string };

export type ChatAgent = (input: {
  messages: readonly ChatMessage[];
}) => AsyncIterable<string>;

export const SYSTEM_PROMPT =
  "You are the Contract Investigation assistant for Lake County, Illinois. Answer questions in plain language. You cannot read the county's contract documents yourself in this version, so answer from what the conversation contains and say plainly when you do not know.";

const textOnly = async function* (
  events: AsyncIterator<ChatStreamEvent>,
): AsyncGenerator<string> {
  const next = await events.next();
  if (next.done) return;
  if (next.value.type === "text") yield next.value.text;
  yield* textOnly(events);
};

export const createChatAgent =
  ({
    client,
    model,
  }: {
    client: OpenRouterClientPort;
    model: string;
  }): ChatAgent =>
  ({ messages }) =>
    textOnly(
      client
        .chatStream({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages.map((m): ChatTurn => ({
              role: m.role === "ai" ? "assistant" : "user",
              content: m.text,
            })),
          ],
        })
        [Symbol.asyncIterator](),
    );
