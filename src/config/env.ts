export type Env = {
  boxAppToken: string;
  boxFolderId: string;
  databaseUrl: string;
};

export function loadEnv(): Env {
  const boxAppToken = process.env.BOX_APP_TOKEN;
  const boxFolderId = process.env.BOX_FOLDER_ID;
  const databaseUrl = process.env.DATABASE_URL;

  if (!boxAppToken) throw new Error("BOX_APP_TOKEN is required");
  if (!boxFolderId) throw new Error("BOX_FOLDER_ID is required");
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  return { boxAppToken, boxFolderId, databaseUrl };
}
