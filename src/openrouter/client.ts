import { OpenRouter } from "@openrouter/sdk";
import { unrecognized } from "@openrouter/sdk/types";

export type CompletionInput = {
  model: string;
  prompt: string;
  attachment?: { filename: string; bytes: Uint8Array };
};

export interface OpenRouterClientPort {
  complete(input: CompletionInput): Promise<string>;
}

export function createOpenRouterClient({
  apiKey,
  pdfEngine,
}: {
  apiKey: string;
  pdfEngine: string;
}): OpenRouterClientPort {
  const client = new OpenRouter({ apiKey });
  // The engine is an open enum the SDK models as a branded string; this brands
  // the configured slug once so `complete` can pass it through without a cast.
  const engine = unrecognized(pdfEngine);

  return {
    async complete({ model, prompt, attachment }) {
      const completion = await client.chat.send({
        chatRequest: {
          model,
          temperature: 0,
          reasoning: { effort: "none" },
          messages: [
            {
              role: "user",
              content: attachment
                ? [
                    { type: "text", text: prompt },
                    {
                      type: "file",
                      file: {
                        filename: attachment.filename,
                        fileData: `data:application/pdf;base64,${Buffer.from(
                          attachment.bytes,
                        ).toString("base64")}`,
                      },
                    },
                  ]
                : [{ type: "text", text: prompt }],
            },
          ],
          ...(attachment
            ? {
                plugins: [{ id: "file-parser", pdf: { engine } }],
              }
            : {}),
        },
      });

      if (!("choices" in completion)) {
        throw new Error(
          "OpenRouter returned a stream where a completion was expected",
        );
      }

      const content = completion.choices[0]?.message.content;

      if (typeof content === "string") return content;

      if (Array.isArray(content)) {
        return content
          .map((item) => ("text" in item ? item.text : ""))
          .join("");
      }

      return "";
    },
  };
}
