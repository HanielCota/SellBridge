import { computeOrderFinance, type OrderFinanceInput } from "@sellbridge/shared/finance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderAdjustments, orderItems, orders, storeConnections } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import {
  exportOrderFinancials,
  getSalesByStore,
  getSalesSummary,
  getSalesTimeseries,
  getTopProducts,
  listOrderFinancials,
  type ReportScope,
} from "./reports.ts";

const db = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantA = "";
let tenantB = "";
let storeA1 = "";
let storeA2 = "";

const PLATFORM_FEE_BPS = 250;
// Brazil midnight of 2026-03-01 = 03:00 UTC.
const range = { from: new Date("2026-03-01T03:00:00Z"), to: new Date("2026-03-08T03:00:00Z") };

interface SeedOrder extends OrderFinanceInput {
  externalOrderId: string;
  orderedAt: string;
  buyerName: string;
  title: string;
  unitPriceCents: number;
}

const ORDERS_A1: SeedOrder[] = [
  {
    externalOrderId: "A-1",
    orderedAt: "2026-03-01T13:00:00Z",
    buyerName: "Mariana",
    title: "Vestido",
    unitPriceCents: 10_000,
    status: "delivered",
    totalCents: 10_000,
    marketplaceFeeCents: 1400,
    items: [{ quantity: 1, unitCostCents: 4000 }],
    adjustments: [{ type: "commission", amountCents: 300 }],
  },
  {
    externalOrderId: "A-2",
    // 23:30 on March 3 in Brasília (02:30 UTC on March 4): belongs to March 3.
    orderedAt: "2026-03-04T02:30:00Z",
    buyerName: "João",
    title: "Camisa",
    unitPriceCents: 5000,
    status: "shipped",
    totalCents: 10_000,
    marketplaceFeeCents: 1200,
    items: [{ quantity: 2, unitCostCents: 2000 }],
    adjustments: [{ type: "refund", amountCents: 1000 }],
  },
  {
    externalOrderId: "A-3",
    orderedAt: "2026-03-05T12:00:00Z",
    buyerName: "Carla",
    title: "Bolsa",
    unitPriceCents: 8000,
    status: "returned",
    totalCents: 8000,
    marketplaceFeeCents: 1000,
    items: [{ quantity: 1, unitCostCents: 3000 }],
    adjustments: [{ type: "return", amountCents: 8000 }],
  },
];

const ORDER_A2: SeedOrder = {
  externalOrderId: "A-4",
  orderedAt: "2026-03-06T12:00:00Z",
  buyerName: "Rafael",
  title: "Tênis",
  unitPriceCents: 20_000,
  status: "paid",
  totalCents: 20_000,
  marketplaceFeeCents: 2800,
  items: [{ quantity: 1, unitCostCents: 9000 }],
  adjustments: [],
};

const OUTSIDE_RANGE: SeedOrder = {
  ...ORDER_A2,
  externalOrderId: "A-OLD",
  orderedAt: "2026-02-20T12:00:00Z",
};

async function insertStore(tenantId: string, name: string) {
  const [store] = await db
    .insert(storeConnections)
    .values({
      tenantId,
      marketplace: "mock",
      externalShopId: `${name}-${tenantId}`,
      shopName: name,
    })
    .returning();
  if (!store) {
    throw new Error("loja não criada");
  }
  return store.id;
}

async function insertOrder(tenantId: string, storeConnectionId: string, seed: SeedOrder) {
  const [order] = await db
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId,
      externalOrderId: seed.externalOrderId,
      status: seed.status,
      totalCents: seed.totalCents,
      marketplaceFeeCents: seed.marketplaceFeeCents,
      buyerName: seed.buyerName,
      orderedAt: new Date(seed.orderedAt),
    })
    .returning();
  if (!order) {
    throw new Error("pedido não criado");
  }
  await db.insert(orderItems).values(
    seed.items.map((item) => ({
      tenantId,
      orderId: order.id,
      title: seed.title,
      quantity: item.quantity,
      unitPriceCents: seed.unitPriceCents,
      unitCostCents: item.unitCostCents,
    })),
  );
  if (seed.adjustments.length > 0) {
    await db
      .insert(orderAdjustments)
      .values(
        seed.adjustments.map((adjustment) => ({ ...adjustment, tenantId, orderId: order.id })),
      );
  }
}

function scope(overrides: Partial<ReportScope> = {}): ReportScope {
  return { tenantId: tenantA, range, platformFeeBps: PLATFORM_FEE_BPS, ...overrides };
}

const expectedFinances = [...ORDERS_A1, ORDER_A2].map((order) =>
  computeOrderFinance(order, PLATFORM_FEE_BPS),
);
function expectedSum(key: keyof (typeof expectedFinances)[number]): number {
  return expectedFinances.reduce((total, finance) => total + finance[key], 0);
}

beforeAll(async () => {
  tenants = await createTestTenants(db, 2);
  const [first, second] = tenants.ids;
  if (!first || !second) {
    throw new Error("tenants não criados");
  }
  tenantA = first;
  tenantB = second;
  storeA1 = await insertStore(tenantA, "Loja A1");
  storeA2 = await insertStore(tenantA, "Loja A2");
  const storeB = await insertStore(tenantB, "Loja B");
  for (const order of ORDERS_A1) {
    await insertOrder(tenantA, storeA1, order);
  }
  await insertOrder(tenantA, storeA2, ORDER_A2);
  await insertOrder(tenantA, storeA2, OUTSIDE_RANGE);
  await insertOrder(tenantB, storeB, { ...ORDER_A2, externalOrderId: "B-1" });
});

afterAll(async () => {
  await tenants.cleanup();
  await db.$client.end();
});

describe("sales summary", () => {
  it("matches the shared profit formula order by order", async () => {
    const summary = await getSalesSummary(db, scope());
    expect(summary).toMatchObject({
      orders: 3,
      cancelledOrders: 1,
      revenueCents: expectedSum("revenueCents"),
      costCents: expectedSum("costCents"),
      feeCents: expectedSum("feeCents"),
      refundCents: expectedSum("refundCents"),
      returnCents: expectedSum("returnCents"),
      commissionCents: expectedSum("commissionCents"),
      platformFeeCents: expectedSum("platformFeeCents"),
      profitCents: expectedSum("profitCents"),
    });
    expect(summary.averageTicketCents).toBe(Math.round(40_000 / 3));
  });

  it("filters by store", async () => {
    const summary = await getSalesSummary(db, scope({ storeConnectionId: storeA2 }));
    expect(summary).toMatchObject({ orders: 1, revenueCents: 20_000 });
  });

  it("never mixes tenants and returns zeros for an empty tenant", async () => {
    const otherTenant = await getSalesSummary(
      db,
      scope({ tenantId: tenantB, storeConnectionId: storeA1 }),
    );
    expect(otherTenant).toMatchObject({
      orders: 0,
      revenueCents: 0,
      profitCents: 0,
      averageTicketCents: null,
    });
  });
});

describe("timeseries", () => {
  it("returns one bucket per Brazil day, filling gaps with zero", async () => {
    const points = await getSalesTimeseries(db, scope(), "day");
    expect(points).toHaveLength(7);
    expect(points[0]).toMatchObject({ date: "2026-03-01", orders: 1, revenueCents: 10_000 });
    expect(points[1]).toMatchObject({ date: "2026-03-02", orders: 0, revenueCents: 0 });
    expect(points[2]).toMatchObject({ date: "2026-03-03", orders: 1, revenueCents: 10_000 });
    expect(points.reduce((total, point) => total + point.profitCents, 0)).toBe(
      expectedSum("profitCents"),
    );
  });
});

describe("breakdowns", () => {
  it("groups revenue by store and ranks top products", async () => {
    const byStore = await getSalesByStore(db, scope());
    expect(byStore.map((store) => [store.storeName, store.revenueCents])).toEqual([
      ["Loja A1", 20_000],
      ["Loja A2", 20_000],
    ]);
    const top = await getTopProducts(db, scope());
    expect(top.at(0)).toMatchObject({ title: "Tênis", units: 1, revenueCents: 20_000 });
    expect(top.map((product) => product.title)).not.toContain("Bolsa");
  });
});

describe("order financials list", () => {
  const pagination = { page: 1, pageSize: 2 };

  it("sorts by profit and paginates on the server", async () => {
    const page = await listOrderFinancials(
      db,
      scope(),
      {},
      { field: "profit", direction: "desc" },
      pagination,
    );
    expect(page.total).toBe(4);
    expect(page.totalPages).toBe(2);
    expect(page.items.map((item) => item.externalOrderId)).toEqual(["A-4", "A-1"]);
  });

  it("filters by status and searches by buyer or product", async () => {
    const returned = await listOrderFinancials(
      db,
      scope(),
      { status: "returned" },
      { field: "orderedAt", direction: "desc" },
      pagination,
    );
    expect(returned.items.map((item) => item.externalOrderId)).toEqual(["A-3"]);
    expect(returned.items.at(0)?.returnCents).toBe(8000);

    const byProduct = await listOrderFinancials(
      db,
      scope(),
      { search: "camis" },
      { field: "orderedAt", direction: "desc" },
      pagination,
    );
    expect(byProduct.items.map((item) => item.externalOrderId)).toEqual(["A-2"]);
  });

  it("exports every matching row with the same numbers", async () => {
    const rows = await exportOrderFinancials(
      db,
      scope(),
      {},
      { field: "orderedAt", direction: "asc" },
    );
    expect(rows.map((row) => row.externalOrderId)).toEqual(["A-1", "A-2", "A-3", "A-4"]);
    expect(rows.reduce((total, row) => total + row.profitCents, 0)).toBe(
      expectedSum("profitCents"),
    );
  });
});
