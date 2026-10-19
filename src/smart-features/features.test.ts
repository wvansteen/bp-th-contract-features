import { describe, expect, it } from "bun:test";
import { SMART_FEATURES } from "./features";

describe("SMART_FEATURES", () => {
  it("covers every feature in docs/features.yml", () => {
    expect(SMART_FEATURES.map((feature) => feature.name)).toEqual([
      "counterparty_name",
      "counterparty_address",
      "effective_date",
      "expiration_date",
      "basis",
      "yearly_cost",
      "total_cost",
      "category",
      "purpose_summary",
      "contract_id",
      "solicitation_id",
      "renewal_terms",
      "payment_terms",
    ]);
  });

  it("gives every feature a non-empty prompt", () => {
    expect(
      SMART_FEATURES.every((feature) => feature.prompt.trim().length > 0),
    ).toBe(true);
  });
});
