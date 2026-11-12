import { describe, expect, it } from "vitest";
import { resellerStepNote } from "./reseller-step-note";

describe("resellerStepNote", () => {
  it("tells the reseller to accept only what the supplier already confirmed", () => {
    expect(resellerStepNote("accepted", "supplier")).toBe(
      "Use só se o fornecedor já te confirmou que aceitou o pedido e não marcou aqui.",
    );
  });

  it("says nothing on the reseller's own parcel", () => {
    expect(resellerStepNote("accepted", "seller")).toBeNull();
  });

  it("says nothing for the delivery, which the reseller confirms", () => {
    expect(resellerStepNote("delivered", "supplier")).toBeNull();
  });
});
