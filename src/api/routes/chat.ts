import { Elysia, t } from "elysia";
import type { ChatAgent } from "../chat/agent";

const encoder = new TextEncoder();
const frame = (data: unknown): string => `data: ${JSON.stringify(data)}\n\n`;

const sseBody = (reply: AsyncIterable<string>): ReadableStream<Uint8Array> => {
  const iterator = reply[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(frame({ text: next.value })));
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            frame({
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
        controller.close();
      }
    },
    cancel() {
      void iterator.return?.();
    },
  });
};

export function createChatRoutes(deps: { agent: ChatAgent }) {
  return new Elysia().post(
    "/chat",
    ({ body }) =>
      new Response(sseBody(deps.agent({ messages: body.messages })), {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        },
      }),
    {
      body: t.Object({
        messages: t.Array(
          t.Object({
            role: t.Union([t.Literal("user"), t.Literal("ai")]),
            text: t.String(),
          }),
        ),
      }),
    },
  );
}
