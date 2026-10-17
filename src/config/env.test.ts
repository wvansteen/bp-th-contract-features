import { afterEach, describe, expect, it } from "bun:test";
import { loadEnv } from "./env";

const KEYS = ["BOX_APP_TOKEN", "BOX_FOLDER_ID", "DATABASE_URL"] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function clearEnv() {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
}

describe("loadEnv", () => {
  it("returns all required env vars", () => {
    clearEnv();
    process.env.BOX_APP_TOKEN = "tok";
    process.env.BOX_FOLDER_ID = "298630595158";
    process.env.DATABASE_URL = "postgresql://bp:bp@localhost:5432/contracts";

    expect(loadEnv()).toEqual({
      boxAppToken: "tok",
      boxFolderId: "298630595158",
      databaseUrl: "postgresql://bp:bp@localhost:5432/contracts",
    });
  });

  it("throws when a required var is missing", () => {
    for (const key of KEYS) {
      clearEnv();
      process.env.BOX_APP_TOKEN = "tok";
      process.env.BOX_FOLDER_ID = "298630595158";
      process.env.DATABASE_URL = "postgresql://bp:bp@localhost:5432/contracts";
      delete process.env[key];

      expect(() => loadEnv()).toThrow(key);
    }
  });
});
