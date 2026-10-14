import { describe, expect, it } from "vitest";
import { ORDER_FIXTURES } from "./fixtures/orders.ts";
import { mapMercadoLivreOrder } from "./orders.ts";
import { orderSchema } from "./schemas.ts";

const paid = ORDER_FIXTURES.paid;
const [line] = paid.order_items;

function withLine(overrides: Record<string, unknown>) {
  return { ...paid, order_items: [{ ...line, ...overrides }] };
}

describe("Mercado Livre order limits", () => {
  it("accepts the edges our money columns and quantities can hold", () => {
    expect(orderSchema.safeParse(withLine({ quantity: 100_000 })).success).toBe(true);
    expect(orderSchema.safeParse({ ...paid, total_amount: 21_474_836.47 }).success).toBe(true);
    expect(orderSchema.safeParse(withLine({ unit_price: 0, sale_fee: 0 })).success).toBe(true);
  });

  it.each([
    ["a quantity above 100.000 units", withLine({ quantity: 100_001 })],
    ["a negative unit price", withLine({ unit_price: -0.01 })],
    ["a negative sale fee, which would raise the profit", withLine({ sale_fee: -1 })],
    ["a total no money column holds", { ...paid, total_amount: 21_474_836.48 }],
    ["an id JSON.parse already rounded", { ...paid, id: 2 ** 53 + 2 }],
    ["a date that is not a date", { ...paid, date_created: "ontem" }],
  ])("refuses %s", (_case, raw) => {
    expect(orderSchema.safeParse(raw).success).toBe(false);
  });

  it("rounds the sale fee once per line, not once per unit", () => {
    // R$ 0,125 per unit: rounding each unit first would charge 13 × 3 = 39 cents.
    const order = mapMercadoLivreOrder(
      orderSchema.parse(withLine({ quantity: 3, unit_price: 10, sale_fee: 0.125 })),
    );
    expect(order.marketplaceFeeCents).toBe(38);
  });
});
