import { describe, expect, it } from "bun:test";
import { createSmartFeatureClassifier } from "./classify";
import { BASE_SMART_FEATURE_PROMPT } from "./prompts";

const document = new Uint8Array([1, 2, 3, 4, 5]);
const filename = "20220920103554.pdf";

async function* noChatText(): AsyncGenerator<string> {
  // The classifier never streams.
}

describe("createSmartFeatureClassifier", () => {
  it("returns one entry per feature keyed by name", async () => {
    const classify = createSmartFeatureClassifier({
      client: {
        complete: ({ prompt }) => Promise.resolve(prompt),
        chatTextStream: noChatText,
      },
      model: "deepseek/deepseek-v4.1-flash-1017",
      features: [
        { name: "Payment Terms", prompt: "payment terms" },
        { name: "Termination", prompt: "termination clause" },
      ],
    });

    expect(await classify({ filename, document })).toEqual({
      "Payment Terms": BASE_SMART_FEATURE_PROMPT({
        filename,
        featurePrompt: "payment terms",
      }),
      Termination: BASE_SMART_FEATURE_PROMPT({
        filename,
        featurePrompt: "termination clause",
      }),
    });
  });

  it("sends the document bytes and file name with every call", async () => {
    const classify = createSmartFeatureClassifier({
      client: {
        complete: ({ attachment }) =>
          Promise.resolve(
            [attachment?.filename ?? "", attachment?.bytes.length ?? 0].join(
              ":",
            ),
          ),
        chatTextStream: noChatText,
      },
      model: "deepseek/deepseek-v4.1-flash-1017",
      features: [{ name: "Payment Terms", prompt: "payment terms" }],
    });

    expect(await classify({ filename, document })).toEqual({
      "Payment Terms": "20220920103554.pdf:5",
    });
  });

  it("returns an empty object when no features are configured", async () => {
    const classify = createSmartFeatureClassifier({
      client: {
        complete: () => Promise.reject(new Error("not used")),
        chatTextStream: noChatText,
      },
      model: "deepseek/deepseek-v4.1-flash-1017",
      features: [],
    });

    expect(await classify({ filename, document })).toEqual({});
  });

  it("stores an empty model reply verbatim", async () => {
    const classify = createSmartFeatureClassifier({
      client: {
        complete: () => Promise.resolve(""),
        chatTextStream: noChatText,
      },
      model: "deepseek/deepseek-v4.1-flash-1017",
      features: [{ name: "Termination", prompt: "termination clause" }],
    });

    expect(await classify({ filename, document })).toEqual({ Termination: "" });
  });

  it("rejects when any feature call fails", () => {
    const classify = createSmartFeatureClassifier({
      client: {
        complete: ({ prompt }) =>
          prompt.includes("boom")
            ? Promise.reject(new Error("model unavailable"))
            : Promise.resolve(prompt),
        chatTextStream: noChatText,
      },
      model: "deepseek/deepseek-v4.1-flash-1017",
      features: [
        { name: "Payment Terms", prompt: "boom" },
        { name: "Termination", prompt: "termination clause" },
      ],
    });

    expect(classify({ filename, document })).rejects.toThrow(
      "model unavailable",
    );
  });
});
