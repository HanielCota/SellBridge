import { describe, expect, it } from "vitest";
import { heldBelowPriceFloor, resumeOutcomeMessage } from "./resume-messages";

describe("resumeOutcomeMessage", () => {
  it("says how many went back on sale", () => {
    const message = resumeOutcomeMessage({ changed: 3, held: 0 });

    expect(message).toBe("3 anúncios voltaram a vender.");
  });

  it("adds what stayed paused because it would lose money", () => {
    const message = resumeOutcomeMessage({ changed: 1, held: 1 });

    expect(message).toBe(
      "1 anúncio voltou a vender. 1 anúncio continua pausado: o preço não cobre o custo e as taxas. Ajuste o preço para reativar.",
    );
  });

  it("says nothing was resumed when every listing would lose money", () => {
    const message = resumeOutcomeMessage({ changed: 0, held: 2 });

    expect(message).toBe(`Nenhum anúncio reativado. ${heldBelowPriceFloor(2)}`);
  });
});
