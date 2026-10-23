import { describe, expect, it } from "vitest";
import { SUPPLIER_FLAG_REASONS } from "./supplier-flags.ts";
import {
  goldenRuleForReason,
  goldenRuleLabel,
  SUPPLIER_FLAG_REASON_RULES,
  SUPPLIER_GOLDEN_RULE_IDS,
  SUPPLIER_GOLDEN_RULES,
} from "./supplier-golden-rules.ts";

describe("supplier golden rules", () => {
  it("are 5, numbered 1 to 5 in order, one per id", () => {
    expect(SUPPLIER_GOLDEN_RULES.map((rule) => rule.number)).toEqual([1, 2, 3, 4, 5]);
    expect(SUPPLIER_GOLDEN_RULES.map((rule) => rule.id)).toEqual([...SUPPLIER_GOLDEN_RULE_IDS]);
  });

  it("each have a title, one plain line and an example", () => {
    for (const rule of SUPPLIER_GOLDEN_RULES) {
      expect(rule.title).not.toBe("");
      expect(rule.summary.endsWith(".")).toBe(true);
      expect(rule.example.endsWith(".")).toBe(true);
    }
  });

  it("name the rule as the supplier reads it", () => {
    const rule = goldenRuleForReason("contact_attempt");
    expect(rule === null ? null : goldenRuleLabel(rule)).toBe(
      "Regra 5: Converse só pela SellBridge",
    );
  });
});

describe("flag reason to golden rule", () => {
  it("maps every flag reason, and only 'other' has no rule", () => {
    expect(Object.keys(SUPPLIER_FLAG_REASON_RULES).toSorted()).toEqual(
      [...SUPPLIER_FLAG_REASONS].toSorted(),
    );
    const withoutRule = SUPPLIER_FLAG_REASONS.filter(
      (reason) => goldenRuleForReason(reason) === null,
    );
    expect(withoutRule).toEqual(["other"]);
  });

  it("points each reason at the rule it breaks", () => {
    expect(goldenRuleForReason("order_error")?.number).toBe(2);
    expect(goldenRuleForReason("product_listing_error")?.number).toBe(2);
    expect(goldenRuleForReason("stale_catalog")?.number).toBe(3);
    expect(goldenRuleForReason("slow_support")?.number).toBe(4);
    expect(goldenRuleForReason("contact_attempt")?.number).toBe(5);
  });
});
