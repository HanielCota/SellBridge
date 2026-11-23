import { formatCents } from "@sellbridge/shared/money";
import { describe, expect, it } from "vitest";
import { receivableText } from "./receivable-text";

describe("receivableText", () => {
  it("shows what is left after the 4% and the Pix fee while the sale stands", () => {
    const text = receivableText({
      status: "accepted",
      orderStatus: "paid",
      receivableCents: 10_000,
    });

    expect(text).toBe(`Cerca de ${formatCents(9401)} (vendido por ${formatCents(10_000)})`);
  });

  it("estimates the card fee for a parcel paid by card", () => {
    const text = receivableText({
      status: "accepted",
      orderStatus: "paid",
      receivableCents: 10_000,
      paidMethod: "CREDIT_CARD",
    });

    expect(text).toBe(`Cerca de ${formatCents(9252)} (vendido por ${formatCents(10_000)})`);
  });

  it("shows zero for a parcel without a cost", () => {
    const text = receivableText({ status: "accepted", orderStatus: "paid", receivableCents: 0 });

    expect(text).toBe(formatCents(0));
  });

  it("shows nothing to receive once the marketplace sale was cancelled", () => {
    const text = receivableText({
      status: "accepted",
      orderStatus: "cancelled",
      receivableCents: 3575,
    });

    expect(text).toBe("Nada · venda cancelada");
  });

  it("shows nothing to receive for a parcel that came back", () => {
    const text = receivableText({ status: "returned", orderStatus: "paid", receivableCents: 3575 });

    expect(text).toBe("Nada · produto devolvido");
  });
});
