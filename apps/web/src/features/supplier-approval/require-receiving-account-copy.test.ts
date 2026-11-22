import { describe, expect, it } from "vitest";
import { requireReceivingAccountConsequence } from "./require-receiving-account-copy";

describe("requireReceivingAccountConsequence", () => {
  it("says new suppliers wait for the receiving account before turning the rule on", () => {
    const consequence = requireReceivingAccountConsequence({ saved: false, chosen: true });

    expect(consequence).toContain("só é aprovado depois que a conta de recebimento");
  });

  it("says new suppliers pass with the CNPJ alone before turning the rule off", () => {
    const consequence = requireReceivingAccountConsequence({ saved: true, chosen: false });

    expect(consequence).toContain("só com o CNPJ ativo");
  });

  it("has nothing to save while the switch is as saved", () => {
    const consequence = requireReceivingAccountConsequence({ saved: true, chosen: true });

    expect(consequence).toBeNull();
  });
});
