import { describe, expect, it } from "bun:test";
import { BASE_SMART_FEATURE_PROMPT } from "./prompts";

describe("BASE_SMART_FEATURE_PROMPT", () => {
  it("interpolates the file name and the feature prompt", () => {
    const prompt = BASE_SMART_FEATURE_PROMPT({
      filename: "20220920103554.pdf",
      featurePrompt: "payment terms",
    });

    expect(prompt).toBe(
      "Your job is to extract one piece of information from a document. The document ```20220920103554.pdf``` is attached to this message. Answer this description with text from the document:\n" +
        "\n" +
        "```payment terms```\n" +
        "\n" +
        "Rules:\n" +
        "1. Copy matching text exactly as it appears in the document, unless the description gives a fixed list of allowed answers; then return exactly one from that list.\n" +
        "2. Return only the answer: no labels, no explanation, no quotation marks, no words of your own. One answer only, never a range and never two candidates.\n" +
        "3. Ignore paperwork boilerplate: instructions, policy statements, certifications, and acknowledgment sentences describe the form, not the deal.\n" +
        "4. Words in the description only hint at the shape of the answer; never copy them into your answer.\n" +
        "5. If the document does not state the information, return nothing at all. Never summarize, guess, or write your own words.",
    );
  });
});
