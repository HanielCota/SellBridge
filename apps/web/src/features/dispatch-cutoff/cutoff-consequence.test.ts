import { describe, expect, it } from "vitest";
import { type CutoffChoice, cutoffConsequence } from "./cutoff-consequence";

const ON: CutoffChoice = {
  enabled: true,
  mercadoLivre: "14:30",
  shopee: "13:00",
  tiktokShop: "18:00",
};
const OFF: CutoffChoice = { ...ON, enabled: false };

describe("cutoffConsequence", () => {
  it("warns that a new time also moves the parcels already with the supplier", () => {
    const consequence = cutoffConsequence(ON, { ...ON, mercadoLivre: "16:00" });

    expect(consequence).toContain("vale também para os pedidos que já estão com o fornecedor");
  });

  it("says only new orders get the rule when it is turned on", () => {
    const consequence = cutoffConsequence(OFF, ON);

    expect(consequence).toContain("os pedidos que chegarem daqui em diante");
  });

  it("says the supplier hours come back when it is turned off", () => {
    const consequence = cutoffConsequence(ON, OFF);

    expect(consequence).toContain("voltam a usar o prazo em horas");
  });

  it("says nothing when only the times of a rule that stays off change", () => {
    const consequence = cutoffConsequence(OFF, { ...OFF, shopee: "12:00" });

    expect(consequence).toBeNull();
  });

  it("says nothing when nothing changes", () => {
    expect(cutoffConsequence(ON, ON)).toBeNull();
  });
});
