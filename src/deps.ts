import { loadEnv } from "./config/env";
import { createBoxClient } from "./box/client";
import { createDbClient } from "./db/client";
import { createDrizzleDocumentStore } from "./db/document-store";
import { createContractQuery, createDrizzleExecutor } from "./db/query";
import { createOpenRouterClient } from "./openrouter/client";
import { createSmartFeatureClassifier } from "./smart-features/classify";
import { SMART_FEATURES } from "./smart-features/features";
import { createChatAgent } from "./chat/agent";
import { createQueryContractsTool } from "./chat/tools";

const env = loadEnv();
const { db } = createDbClient(env.databaseUrl);

export const boxClient = createBoxClient({ token: env.boxAppToken });
export const documentStore = createDrizzleDocumentStore(db);
export const boxFolderId = env.boxFolderId;
export const openRouterClient = createOpenRouterClient({
  apiKey: env.openRouterApiKey,
});

export const smartFeatureClassifier = createSmartFeatureClassifier({
  client: openRouterClient,
  model: env.smartFeatureModel,
  features: SMART_FEATURES,
});

const contractQuery = createContractQuery(createDrizzleExecutor(db));

export const chatAgent = createChatAgent({
  client: openRouterClient,
  model: env.chatModel,
  tools: [
    createQueryContractsTool({
      query: contractQuery,
      features: SMART_FEATURES,
    }),
  ],
});

export type InngestEventSender = {
  send(event: { name: string; data: unknown }): Promise<unknown>;
};
