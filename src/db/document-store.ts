import type { DrizzleDb } from "./client";
import { documents } from "./schema";

export type StoredDocument = {
  documentId: string;
  metadata: Record<string, unknown>;
};

export interface DocumentStore {
  upsert(doc: StoredDocument): Promise<void>;
  listAll(): Promise<StoredDocument[]>;
}

export function createDrizzleDocumentStore(db: DrizzleDb): DocumentStore {
  return {
    async upsert({ documentId, metadata }) {
      await db
        .insert(documents)
        .values({ document_id: documentId, metadata })
        .onConflictDoUpdate({
          target: documents.document_id,
          set: { metadata },
        });
    },

    async listAll() {
      const rows = await db
        .select({
          document_id: documents.document_id,
          metadata: documents.metadata,
        })
        .from(documents)
        .orderBy(documents.document_id);

      return rows.map((row) => ({
        documentId: row.document_id,
        metadata: row.metadata,
      }));
    },
  };
}
