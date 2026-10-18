import { Inngest, eventType, staticSchema } from "inngest";

export const helloWorldEvent = eventType("demo/hello.world", {
  schema: staticSchema<{ name?: string }>(),
});

export const inngest = new Inngest({ id: "contract-features" });
