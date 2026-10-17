import { BoxClient, BoxDeveloperTokenAuth } from "box-node-sdk";

export type BoxFileEntry = { id: string; type: string; name: string };
export type BoxPage = { entries: BoxFileEntry[]; totalCount: number };

export interface BoxClientPort {
  listFiles(args: { folderId: string; offset: number; limit: number }): Promise<BoxPage>;
  describeFile(args: { fileId: string }): Promise<Record<string, unknown>>;
}

export function createBoxClient({ token }: { token: string }): BoxClientPort {
  const sdk = new BoxClient({ auth: new BoxDeveloperTokenAuth({ token }) });

  return {
    async listFiles({ folderId, offset, limit }) {
      const result = await sdk.folders.getFolderItems(folderId, {
        queryParams: { offset, limit },
      });

      if (result.totalCount === undefined) {
        throw new Error(
          `Box returned no total_count for folder ${folderId} at offset ${offset}`,
        );
      }

      return {
        entries: (result.entries ?? []).map((entry) => ({
          id: entry.id,
          type: entry.type,
          name: entry.name ?? "",
        })),
        totalCount: result.totalCount,
      };
    },

    async describeFile({ fileId }) {
      const file = await sdk.files.getFileById(fileId);
      return file as unknown as Record<string, unknown>;
    },
  };
}
