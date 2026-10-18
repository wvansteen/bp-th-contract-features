import { describe, expect, it } from "bun:test";
import type { ChatAgent } from "../chat/agent";
import { createChatRoutes } from "./chat";

async function* deltas(chunks: readonly string[]): AsyncGenerator<string> {
  await Promise.resolve();
  yield* chunks;
}

const request = (body: unknown) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/chat", () => {
  it("streams deep-chat SSE frames and closes the stream", async () => {
    const response = await createChatRoutes({
      agent: () => deltas(["Hel", "lo"]),
    }).handle(request({ messages: [{ role: "user", text: "hi" }] }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe(
      'data: {"text":"Hel"}\n\ndata: {"text":"lo"}\n\n',
    );
  });

  it("passes the conversation to the agent", async () => {
    const agent: ChatAgent = ({ messages }) =>
      deltas([messages.map((m) => `${m.role}:${m.text}`).join("|")]);
    const response = await createChatRoutes({ agent }).handle(
      request({
        messages: [
          { role: "user", text: "hi" },
          { role: "ai", text: "hello" },
        ],
      }),
    );

    expect(await response.text()).toBe('data: {"text":"user:hi|ai:hello"}\n\n');
  });

  it("emits an error frame when the reply stream throws", async () => {
    async function* broken(): AsyncGenerator<string> {
      await Promise.resolve();
      yield "Hel";
      throw new Error("model unavailable");
    }
    const response = await createChatRoutes({ agent: () => broken() }).handle(
      request({ messages: [{ role: "user", text: "hi" }] }),
    );

    expect(await response.text()).toBe(
      'data: {"text":"Hel"}\n\ndata: {"error":"model unavailable"}\n\n',
    );
  });

  it("rejects a role deep-chat never sends", async () => {
    const response = await createChatRoutes({ agent: () => deltas([]) }).handle(
      request({ messages: [{ role: "system", text: "hi" }] }),
    );

    expect(response.status).toBe(422);
  });

  it("cancelling the response body ends the reply stream", async () => {
    const pending = deltas(["Hel", "lo"]);
    const response = await createChatRoutes({ agent: () => pending }).handle(
      request({ messages: [{ role: "user", text: "hi" }] }),
    );

    await response.body?.cancel();

    expect((await pending.next()).done).toBe(true);
  });
});
