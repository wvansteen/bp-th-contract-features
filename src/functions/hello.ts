import { helloWorldEvent, inngest } from "../inngest";

export const helloWorld = inngest.createFunction(
  { id: "hello-world", triggers: [helloWorldEvent] },
  async ({ event, step }) => {
    const result = await step.run("say-hello", () => {
      const message = `Hello ${event.data.name ?? "world"}`;
      console.log(message);
      return { message };
    });
    return result;
  },
);
