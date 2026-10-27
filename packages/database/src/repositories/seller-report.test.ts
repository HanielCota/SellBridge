import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, storeConnections } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
} from "../testing/fixtures.ts";
import type { ReportScope } from "./reports.ts";
import { getOrderStatusCounts, getSalesHeatmap, listSellerReportCases } from "./seller-report.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantA = "";

// Brazil midnight of 2026-03-02 (a Monday) = 03:00 UTC; one week.
const range = { from: new Date("2026-03-02T03:00:00Z"), to: new Date("2026-03-09T03:00:00Z") };

interface SeedOrder {
  externalOrderId: string;
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "returned";
  orderedAt: string;
  knownCost: boolean;
}

const SEED: SeedOrder[] = [
  // Monday 10:00 in Brasília: morning band.
  {
    externalOrderId: "S-1",
    status: "delivered",
    orderedAt: "2026-03-02T13:00:00Z",
    knownCost: true,
  },
  // Monday 23:30 in Brasília (Tuesday 02:30 UTC): still Monday, night band.
  { externalOrderId: "S-2", status: "paid", orderedAt: "2026-03-03T02:30:00Z", knownCost: false },
  {
    externalOrderId: "S-3",
    status: "cancelled",
    orderedAt: "2026-03-04T15:00:00Z",
    knownCost: true,
  },
  {
    externalOrderId: "S-4",
    status: "returned",
    orderedAt: "2026-03-05T15:00:00Z",
    knownCost: true,
  },
  // Unpaid with an unknown cost: not a sale, so not a pending cost either.
  {
    externalOrderId: "S-5",
    status: "pending",
    orderedAt: "2026-03-06T15:00:00Z",
    knownCost: false,
  },
  {
    externalOrderId: "S-OLD",
    status: "cancelled",
    orderedAt: "2026-02-20T15:00:00Z",
    knownCost: true,
  },
];

async function insertStore(tenantId: string) {
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId,
      marketplace: "mock",
      externalShopId: `seller-report-${tenantId}`,
      shopName: "Loja R",
    })
    .returning();
  if (!store) {
    throw new Error("loja não criada");
  }
  return store.id;
}

async function insertOrder(tenantId: string, storeConnectionId: string, seed: SeedOrder) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId,
      externalOrderId: seed.externalOrderId,
      status: seed.status,
      totalCents: 10_000,
      marketplaceFeeCents: 0,
      orderedAt: new Date(seed.orderedAt),
    })
    .returning();
  if (!order) {
    throw new Error("pedido não criado");
  }
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    supplierProductId: seed.knownCost ? catalog.productId : null,
    title: "Item",
    quantity: 1,
    unitPriceCents: 10_000,
    unitCostCents: 4000,
  });
}

function scope(tenantId = tenantA): ReportScope {
  return { tenantId, range, platformFeeBasisPoints: 0 };
}

beforeAll(async () => {
  catalog = await createTestSupplierProduct(database, {
    sku: "SELLER-REPORT-1",
    title: "Produto do relatório",
    costCents: 4000,
    suggestedPriceCents: 10_000,
  });
  tenants = await createTestTenants(database, 2);
  const [first, second] = tenants.ids;
  if (!first || !second) {
    throw new Error("tenants não criados");
  }
  tenantA = first;
  const storeA = await insertStore(tenantA);
  for (const seed of SEED) {
    await insertOrder(tenantA, storeA, seed);
  }
  const storeB = await insertStore(second);
  await insertOrder(second, storeB, {
    externalOrderId: "B-1",
    status: "cancelled",
    orderedAt: "2026-03-04T15:00:00Z",
    knownCost: true,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("seller report queries", () => {
  it("counts every order of the period by status, for this tenant only", async () => {
    expect(await getOrderStatusCounts(database, scope())).toEqual({
      pending: 1,
      paid: 1,
      shipped: 0,
      delivered: 1,
      cancelled: 1,
      returned: 1,
    });
  });

  it("places sales by weekday and band in Brazil time", async () => {
    expect(await getSalesHeatmap(database, scope())).toEqual([
      { weekday: 1, band: 1, orders: 1 },
      { weekday: 1, band: 3, orders: 1 },
    ]);
  });

  it("lists each problem with its total, sales of unknown cost only", async () => {
    const pending = await listSellerReportCases(database, scope(), {
      kind: "cost_pending",
      limit: 8,
    });
    expect(pending.total).toBe(1);
    expect(pending.items.map((item) => item.externalOrderId)).toEqual(["S-2"]);
    const cancelled = await listSellerReportCases(database, scope(), {
      kind: "cancelled",
      limit: 8,
    });
    expect(cancelled).toMatchObject({
      total: 1,
      items: [{ externalOrderId: "S-3", storeName: "Loja R" }],
    });
  });

  it("keeps the full total when the list is cut", async () => {
    const wider = { ...scope(), range: { from: new Date("2026-02-01T03:00:00Z"), to: range.to } };
    const cancelled = await listSellerReportCases(database, wider, { kind: "cancelled", limit: 1 });
    expect(cancelled.total).toBe(2);
    expect(cancelled.items.map((item) => item.externalOrderId)).toEqual(["S-3"]);
  });
});
