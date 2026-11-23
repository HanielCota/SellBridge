import { formatCents } from "@sellbridge/shared/money";
import { describe, expect, it } from "vitest";
import { receivableText } from "./receivable-text";

describe("receivableText", () => {
  it("shows the parcel's cost while the sale stands", () => {
    const text = receivableText({ status: "accepted", orderStatus: "paid", receivableCents: 3575 });

    expect(text).toBe(formatCents(3575));
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
