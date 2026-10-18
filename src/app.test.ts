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

  test("the page loads one local stylesheet and no remote assets", async () => {
    const body = await Bun.file("public/index.html").text();
    expect(body).toContain('href="lake-county.css"');
    expect(body).not.toMatch(/src="https?:/);
    expect(body).not.toMatch(/href="https?:/);
  });

  test("the page carries the Lake County brand and the chat element", async () => {
    const body = await Bun.file("public/index.html").text();
    expect(body).toContain("Lake County, Illinois");
    expect(body).toContain("Contract Investigation");
    expect(body).toContain("<deep-chat");
  });

  test("the page script obeys the repo style locks", async () => {
    const body = await Bun.file("public/index.html").text();
    expect(body).not.toMatch(
      /<script[^>]*>[\s\S]*?\b(let |var |for\(|while\(|do\()/,
    );
  });

  test("GET / serves the page", async () => {
    const app = createApp({ inngestHandler: handler });
    const response = await app.handle(new Request("http://localhost/"));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("Contract Investigation");
  });

  test("GET /lake-county.css serves the stylesheet", async () => {
    const app = createApp({ inngestHandler: handler });
    const response = await app.handle(
      new Request("http://localhost/lake-county.css"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
  });
});
