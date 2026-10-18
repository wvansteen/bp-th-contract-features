import { loadEnv } from "./config/env";
import { createBoxClient } from "./box/client";
import { createDbClient } from "./db/client";
import { createDrizzleDocumentStore } from "./db/document-store";
import { createOpenRouterClient } from "./openrouter/client";

const env = loadEnv();
const { db } = createDbClient(env.databaseUrl);

export const boxClient = createBoxClient({ token: env.boxAppToken });
export const documentStore = createDrizzleDocumentStore(db);
export const boxFolderId = env.boxFolderId;
export const openRouterClient = createOpenRouterClient({
  apiKey: env.openRouterApiKey,
  pdfEngine: env.ocrModel,
});

export type InngestEventSender = {
  send(event: { name: string; data: unknown }): Promise<unknown>;
};
