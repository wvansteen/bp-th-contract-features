import { existsSync } from "node:fs";
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";

export async function deepChatAssets(assets: string): Promise<Elysia> {
  if (!existsSync(assets)) return new Elysia();

  return staticPlugin({ prefix: "/deep-chat", assets });
}
