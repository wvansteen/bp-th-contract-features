import { inngest } from "./inngest";

await inngest.send({ name: "demo/hello.world", data: { name: "local" } });
console.log("sent demo/hello.world");
