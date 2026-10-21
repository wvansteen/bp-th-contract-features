export type Env = {
  boxAppToken: string;
  boxFolderId: string;
  databaseUrl: string;
  openRouterApiKey: string;
  smartFeatureModel: string;
  chatModel: string;
};

export function loadEnv(): Env {
  const boxAppToken = process.env.BOX_APP_TOKEN;
  const boxFolderId = process.env.BOX_FOLDER_ID;
  const databaseUrl = process.env.DATABASE_URL;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const smartFeatureModel = process.env.SMART_FEATURE_MODEL;
  const chatModel = process.env.CHAT_MODEL;

  if (!boxAppToken) throw new Error("BOX_APP_TOKEN is required");
  if (!boxFolderId) throw new Error("BOX_FOLDER_ID is required");
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!openRouterApiKey) throw new Error("OPENROUTER_API_KEY is required");
  if (!smartFeatureModel) throw new Error("SMART_FEATURE_MODEL is required");
  if (!chatModel) throw new Error("CHAT_MODEL is required");

  return {
    boxAppToken,
    boxFolderId,
    databaseUrl,
    openRouterApiKey,
    smartFeatureModel,
    chatModel,
  };
}
