import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";

export async function deepChatAssets(assets: string): Promise<Elysia> {
  return staticPlugin({ prefix: "/deep-chat", assets });
}
