import { pgTable, text, jsonb, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Keep the backslash doubled.
const bytea = customType<{ data: Uint8Array }>({
  dataType() {
    return "bytea";
  },
});

export const documents = pgTable("documents", {
  document_id: text("document_id").primaryKey(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  document: bytea("document")
    .notNull()
    .default(sql`'\\x'::bytea`),
  smart_features: jsonb("smart_features")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
});
