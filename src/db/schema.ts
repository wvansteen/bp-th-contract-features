import { pgTable, text, jsonb } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  document_id: text("document_id").primaryKey(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
});
