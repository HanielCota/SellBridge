import { describe, expect, it } from "vitest";
import { isForwardEmailFailureNote, SUPPLIER_EMAIL_FAILED_NOTE } from "./forward-notes.ts";
import { deliveryFailureOf } from "./supplier-panel-attention-signals.ts";

describe("forward e-mail failure note", () => {
  it("recognizes the note the forward writes, whatever its wording", () => {
    expect(isForwardEmailFailureNote(SUPPLIER_EMAIL_FAILED_NOTE)).toBe(true);
    expect(deliveryFailureOf(SUPPLIER_EMAIL_FAILED_NOTE)).toBe("email");
  });

  it("does not take another note that mentions an e-mail for the failure", () => {
    const occurrence = "O e-mail de rastreio ao comprador não foi enviado ainda";
    expect(isForwardEmailFailureNote(occurrence)).toBe(false);
    expect(deliveryFailureOf(occurrence)).toBeNull();
  });
});
