import { pgTable, text, jsonb, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Drizzle 0.45.4 ships no first-class bytea column, so define one over the
// raw Postgres type. The default is written `'\\x'::bytea` because drizzle-kit
// reads the cooked template string, where a lone `\x` is an invalid escape and
// would serialize as an empty default.
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
