export const BASE_SMART_FEATURE_PROMPT = (input: {
  filename: string;
  featurePrompt: string;
}): string =>
  `Your job is to classify features from Documents. Your only output should ever be the exact text of the document matching your \`Smart Feature Prompt\`. What you will do is:
Use this document \`\`\`${input.filename}\`\`\` attached to this message to identify the part of the document which is most closely described by this \`\`\`${input.featurePrompt}\`\`\` Include the matching part of the source document and no other.`;
