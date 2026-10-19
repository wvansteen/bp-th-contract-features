import type { OpenRouterClientPort } from "../openrouter/client";
import type { SmartFeature } from "./features";
import { BASE_SMART_FEATURE_PROMPT } from "./prompts";

export type ClassifySmartFeatures = (input: {
  filename: string;
  document: Uint8Array;
}) => Promise<Record<string, string>>;

export const createSmartFeatureClassifier =
  ({
    client,
    model,
    features,
  }: {
    client: OpenRouterClientPort;
    model: string;
    features: readonly SmartFeature[];
  }): ClassifySmartFeatures =>
  async ({ filename, document }) => {
    const entries = await Promise.all(
      features.map(async (feature): Promise<readonly [string, string]> => [
        feature.name,
        await client.complete({
          model,
          prompt: BASE_SMART_FEATURE_PROMPT({
            filename,
            featurePrompt: feature.prompt,
          }),
          attachment: { filename, bytes: document },
        }),
      ]),
    );

    return Object.fromEntries(entries);
  };
