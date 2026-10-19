import { describe, expect, it } from "bun:test";
import { BASE_SMART_FEATURE_PROMPT } from "./prompts";

describe("BASE_SMART_FEATURE_PROMPT", () => {
  it("interpolates the file name and the feature prompt", () => {
    const prompt = BASE_SMART_FEATURE_PROMPT({
      filename: "20220920103554.pdf",
      featurePrompt: "payment terms",
    });

    expect(prompt).toBe(
      "Your job is to classify features from Documents. Your only output should ever be the exact text of the document matching your `Smart Feature Prompt`. What you will do is:\n" +
        "Use this document ```20220920103554.pdf``` attached to this message to identify the part of the document which is most closely described by this ```payment terms``` Include the matching part of the source document and no other.",
    );
  });
});
