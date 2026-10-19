import { describe, expect, it } from "bun:test";
import { SMART_FEATURES } from "./features";

describe("SMART_FEATURES", () => {
  it("carries no example text a model could copy", () => {
    expect(
      SMART_FEATURES.every((feature) => !/[`\d$]/.test(feature.prompt)),
    ).toBe(true);
  });
});
