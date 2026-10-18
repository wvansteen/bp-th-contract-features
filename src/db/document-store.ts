import type { DrizzleDb } from "./client";
import { documents } from "./schema";

export type StoredDocument = {
  documentId: string;
  metadata: Record<string, unknown>;
  document: Uint8Array;
  smartFeatures: Record<string, string>;
};

export type StoredDocumentSummary = Pick<
  StoredDocument,
  "documentId" | "metadata" | "smartFeatures"
>;

export interface DocumentStore {
  upsert(doc: StoredDocument): Promise<void>;
  listAll(): Promise<StoredDocumentSummary[]>;
}

export function createDrizzleDocumentStore(db: DrizzleDb): DocumentStore {
  return {
    async upsert({ documentId, metadata, document, smartFeatures }) {
      await db
        .insert(documents)
        .values({
          document_id: documentId,
          metadata,
          document,
          smart_features: smartFeatures,
        })
        .onConflictDoUpdate({
          target: documents.document_id,
          set: { metadata, document, smart_features: smartFeatures },
        });
    },

    async listAll() {
      const rows = await db
        .select({
          document_id: documents.document_id,
          metadata: documents.metadata,
          smart_features: documents.smart_features,
        })
        .from(documents)
        .orderBy(documents.document_id);

      return rows.map((row) => ({
        documentId: row.document_id,
        metadata: row.metadata,
        smartFeatures: row.smart_features,
      }));
    },
  };
}
