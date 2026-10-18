import { loadEnv } from "./config/env";
import { createBoxClient } from "./box/client";
import { createDbClient } from "./db/client";
import { createDrizzleDocumentStore } from "./db/document-store";

const env = loadEnv();
const { db } = createDbClient(env.databaseUrl);

export const boxClient = createBoxClient({ token: env.boxAppToken });
export const documentStore = createDrizzleDocumentStore(db);
export const boxFolderId = env.boxFolderId;

export type InngestEventSender = {
  send(event: { name: string; data: unknown }): Promise<unknown>;
};
