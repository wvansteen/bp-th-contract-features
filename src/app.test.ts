import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { createApp } from "./app";

const handler = () => Promise.resolve(new Response(null, { status: 200 }));
const contractsRoutes = new Elysia();

describe("createApp", () => {
  test("GET / serves the Contract Investigation page", async () => {
    const app = createApp({ inngestHandler: handler, contractsRoutes });
    const response = await app.handle(new Request("http://localhost/"));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("<deep-chat");
    expect(body).toContain("Contract Investigation");
  });

  test("GET /chat redirects to /", async () => {
    const app = createApp({ inngestHandler: handler, contractsRoutes });
    const response = await app.handle(new Request("http://localhost/chat"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });
});
