import { BoxClient, BoxDeveloperTokenAuth } from "box-node-sdk";

export type BoxFileEntry = { id: string; type: string; name: string };
export type BoxPage = { entries: BoxFileEntry[]; totalCount: number };

export interface BoxClientPort {
  listFiles(args: {
    folderId: string;
    offset: number;
    limit: number;
  }): Promise<BoxPage>;
  describeFile(args: { fileId: string }): Promise<unknown>;
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
          `Box returned no totalCount for folder ${folderId} at offset ${offset}`,
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
      return sdk.files.getFileById(fileId);
    },
  };
}
