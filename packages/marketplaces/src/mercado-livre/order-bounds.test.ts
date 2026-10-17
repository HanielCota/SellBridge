import { describe, expect, it } from "vitest";
import { ORDER_FIXTURES } from "./fixtures/orders.ts";
import { mapMercadoLivreOrder } from "./orders.ts";
import { orderSchema, userSchema } from "./schemas.ts";

const base = ORDER_FIXTURES.paid;
const [line] = base.order_items;
if (!line) throw new Error("Fixture without items");
/** Largest amount that still fits the integer cents columns, and one cent more. */
const MAX_AMOUNT = 21_474_836.47;

describe("Mercado Livre order bounds", () => {
  it("accepts amounts up to the integer cents column and refuses one cent more", () => {
    expect(orderSchema.safeParse({ ...base, total_amount: MAX_AMOUNT }).success).toBe(true);
    expect(orderSchema.safeParse({ ...base, total_amount: 21_474_836.48 }).success).toBe(false);
  });

  it("refuses negative amounts, which would turn a sale into credit", () => {
    expect(orderSchema.safeParse({ ...base, total_amount: -1 }).success).toBe(false);
    const negativeLine = { ...line, unit_price: -0.01 };
    expect(orderSchema.safeParse({ ...base, order_items: [negativeLine] }).success).toBe(false);
    const negativeRefund = [{ ...base.payments[0], transaction_amount_refunded: -5 }];
    expect(orderSchema.safeParse({ ...base, payments: negativeRefund }).success).toBe(false);
  });

  it("refuses a quantity of zero, fractions and absurd counts", () => {
    for (const quantity of [0, 1.5, 100_001]) {
      const lines = [{ ...line, quantity }];
      expect(orderSchema.safeParse({ ...base, order_items: lines }).success).toBe(false);
    }
  });

  it("refuses a sale date that is not an ISO instant", () => {
    for (const date_created of ["", "ontem", "2026-02-30"]) {
      expect(orderSchema.safeParse({ ...base, date_created }).success).toBe(false);
    }
  });

  it("refuses a numeric id that lost digits past 2^53", () => {
    expect(orderSchema.safeParse({ ...base, id: 2 ** 53 + 2 }).success).toBe(false);
    expect(orderSchema.safeParse({ ...base, id: "9007199254740993" }).success).toBe(true);
  });

  it("refuses a fee total that no longer fits, even with each line in range", () => {
    const lines = [{ ...line, quantity: 100_000, sale_fee: 300 }];
    const raw = orderSchema.parse({ ...base, order_items: lines });
    // Regression: a plain Error was retried for 24 hours; a final answer stops the webhook job.
    expect(() => mapMercadoLivreOrder(raw)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("acima do armazenável"),
        details: expect.objectContaining({ retryable: false }),
      }),
    );
  });

  it("refuses a seller id that lost digits past 2^53", () => {
    expect(userSchema.safeParse({ id: 2 ** 53 + 2, nickname: "loja" }).success).toBe(false);
    expect(userSchema.safeParse({ id: 2 ** 53 - 1, nickname: "loja" }).success).toBe(true);
    expect(userSchema.safeParse({ id: 12.5, nickname: "loja" }).success).toBe(false);
  });

  it("reports no refund when the payload has no payments, so the last one stays", () => {
    const { payments: _payments, ...withoutPayments } = base;
    expect(mapMercadoLivreOrder(orderSchema.parse(withoutPayments)).refundedCents).toBeUndefined();
    expect(mapMercadoLivreOrder(orderSchema.parse(base)).refundedCents).toBe(0);
  });

  it("reads a blank buyer nickname as no buyer name", () => {
    const blank = orderSchema.parse({ ...base, buyer: { id: 1, nickname: " " } });
    expect(mapMercadoLivreOrder(blank).buyerName).toBeNull();
  });
});
