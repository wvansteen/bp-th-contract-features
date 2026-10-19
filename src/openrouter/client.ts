import { OpenRouter } from "@openrouter/sdk";

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
}: {
  apiKey: string;
}): OpenRouterClientPort {
  const client = new OpenRouter({ apiKey });

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
