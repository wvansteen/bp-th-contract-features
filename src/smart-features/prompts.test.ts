import { describe, expect, it } from "bun:test";
import { BASE_SMART_FEATURE_PROMPT } from "./prompts";

describe("BASE_SMART_FEATURE_PROMPT", () => {
  it("interpolates the file name and the feature prompt", () => {
    const prompt = BASE_SMART_FEATURE_PROMPT({
      filename: "20220920103554.pdf",
      featurePrompt: "payment terms",
    });

    expect(prompt).toBe(
      "Your job is to extract one piece of information from a document. The document ```20220920103554.pdf``` is attached to this message. Find the text in the document that answers this description:\n" +
        "\n" +
        "```payment terms```\n" +
        "\n" +
        "Rules:\n" +
        "1. Copy the matching text exactly as it appears in the document.\n" +
        '2. Return only the matching text: no labels, no explanation, no quotation marks, and no words of your own. A date is returned exactly as written, for example `11/22/2022`, never as "the date is 11/22/2022".\n' +
        "3. Return one match. If several parts of the document qualify, follow any preference given in the description.\n" +
        "4. If the document does not contain the information, return nothing at all.",
    );
  });
});
