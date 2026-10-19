export const BASE_SMART_FEATURE_PROMPT = (input: {
  filename: string;
  featurePrompt: string;
}): string =>
  `Your job is to extract one piece of information from a document. The document \`\`\`${input.filename}\`\`\` is attached to this message. Find the text in the document that answers this description:\n\n\`\`\`${input.featurePrompt}\`\`\`\n\nRules:\n1. Copy the matching text exactly as it appears in the document.\n2. Return only the matching text: no labels, no explanation, no quotation marks, and no words of your own. A date is returned exactly as written, for example \`11/22/2022\`, never as "the date is 11/22/2022".\n3. Return one match. If several parts of the document qualify, follow any preference given in the description.\n4. If the document does not contain the information, return nothing at all.`;
