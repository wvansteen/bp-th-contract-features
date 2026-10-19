export type SmartFeature = { name: string; prompt: string };

// Names must be unique. If there are duplicates then the last wins.
export const SMART_FEATURES: readonly SmartFeature[] = [];
