import { problemsLoggedBy } from "@sellbridge/shared/problem-capture-testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { readableOrders } from "./readable-orders.ts";
import type { MarketplaceOrder } from "./types.ts";

const rowSchema = z.object({ id: z.string(), total: z.number() });

function mapRow(raw: z.infer<typeof rowSchema>): MarketplaceOrder {
  if (raw.total < 0) {
    throw new Error("negative total");
  }
  return {
    externalOrderId: raw.id,
    status: "paid",
    totalCents: raw.total,
    marketplaceFeeCents: 0,
    buyerName: null,
    orderedAt: new Date("2026-11-18T12:00:00Z"),
    items: [],
  };
}

const input = {
  schema: rowSchema,
  map: mapRow,
  event: "mercado_livre.order_skipped",
  channelOwner: "do Mercado Livre",
  externalShopId: "SHOP-1",
};

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readable orders", () => {
  it("puts each sale it cannot read on Problemas and keeps the rest", async () => {
    let orders: MarketplaceOrder[] = [];

    const problems = await problemsLoggedBy(() => {
      orders = readableOrders(
        [{ id: "100", total: 10 }, { id: 200 }, { id: "300", total: -1 }],
        input,
      );
    });

    expect(orders).toHaveLength(1);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatchObject({
      event: "mercado_livre.order_skipped",
      area: "orders",
      message: expect.stringContaining("Uma venda do Mercado Livre"),
      context: { externalOrderId: "200", externalShopId: "SHOP-1" },
    });
    expect(problems[1]?.context.externalOrderId).toBe("300");
    expect(problems[0]?.fingerprint).not.toBe(problems[1]?.fingerprint);
  });
});
