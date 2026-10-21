import { serve } from "inngest/bun";
import { createApi } from "./app";
import { chatAgent, documentStore } from "./deps";
import { inngest, listFilesFn, processFileFn } from "./inngest";

const inngestHandler = serve({
  client: inngest,
  functions: [listFilesFn, processFileFn],
});

export default createApi({
  inngest,
  inngestHandler,
  store: documentStore,
  agent: chatAgent,
});
