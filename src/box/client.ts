import { BoxClient, BoxDeveloperTokenAuth } from "box-node-sdk";
import { fileBytes } from "./download";

export type BoxFileEntry = { id: string; type: string; name: string };
export type BoxPage = { entries: BoxFileEntry[]; totalCount: number };

export interface BoxClientPort {
  listFiles(args: {
    folderId: string;
    offset: number;
    limit: number;
  }): Promise<BoxPage>;
  describeFile(args: { fileId: string }): Promise<unknown>;
  downloadFile(args: { fileId: string }): Promise<Uint8Array>;
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

    async downloadFile({ fileId }) {
      // GET /files/{id}/content answers 302 to a pre-signed dl.boxcloud.com
      // URL; fetch follows the redirect. The target works with or without the
      // auth header.
      const url = await sdk.downloads.getDownloadFileUrl(fileId);
      return fileBytes({
        url,
        fetchResponse: (downloadUrl) =>
          fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${token}` },
          }),
      });
    },
  };
}
