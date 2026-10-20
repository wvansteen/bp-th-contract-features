import type { ContractQuery } from "../db/query";
import type { ChatToolDefinition } from "../openrouter/client";
import type { SmartFeature } from "../smart-features/features";

const MAX_RESULT_CHARS = 20_000;

export type ChatTool = {
  definition: ChatToolDefinition;
  run(argumentsJson: string): Promise<string>;
};

type SqlArgument = { sql: string } | { error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sqlOf = (argumentsJson: string): SqlArgument => {
  try {
    const parsed: unknown = JSON.parse(argumentsJson);
    if (!isRecord(parsed) || typeof parsed.sql !== "string") {
      return { error: "Missing sql string" };
    }
    return { sql: parsed.sql };
  } catch {
    return { error: "Arguments must be valid JSON" };
  }
};

const descriptionFor = (features: readonly SmartFeature[]): string =>
  `Read the county's contract documents and their extracted smart features.

The table is documents:
- document_id text: the Box file id.
- metadata jsonb: the Box file record. Useful keys: metadata->>'name', metadata->>'size', metadata->>'created_at', metadata->>'modified_at'.
- smart_features jsonb: extracted contract values keyed by feature name: ${features.map((feature) => feature.name).join(", ")}. Values are strings, possibly empty.
- document bytea: the PDF. Never select it.

Use PostgreSQL JSON syntax, for example:
- smart_features->>'category' = 'lease'
- (smart_features->>'total_cost')::numeric > 100000
- smart_features @> '{"category":"technology_services"}'
- (smart_features->>'expiration_date')::date between now() and now() + interval '90 days'
- metadata->>'name' ilike '%renewal%'

Send exactly one SELECT or WITH statement. Results are capped at 100 rows.`;

export const createQueryContractsTool = ({
  query,
  features,
}: {
  query: ContractQuery;
  features: readonly SmartFeature[];
}): ChatTool => ({
  definition: {
    name: "query_contracts",
    description: descriptionFor(features),
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "One PostgreSQL SELECT or WITH statement.",
        },
      },
      required: ["sql"],
    },
  },
  run: async (argumentsJson) => {
    const argument = sqlOf(argumentsJson);
    if ("error" in argument) return JSON.stringify({ error: argument.error });
    try {
      const payload = JSON.stringify(await query(argument.sql));
      if (payload.length > MAX_RESULT_CHARS) {
        return JSON.stringify({
          error: "Result too large. Select fewer columns or rows.",
        });
      }
      return payload;
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
