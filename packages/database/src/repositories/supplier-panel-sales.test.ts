import { randomUUID } from "node:crypto";
import type { FulfillmentStatus, OrderStatus } from "@sellbridge/shared/schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  orderItems,
  orders,
  orderShipments,
  orderStatusChanges,
  supplierPaymentAccounts,
  supplierProducts,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { upsertStoreConnection } from "./stores.ts";
import { exportSupplierSaleLines } from "./supplier-panel-sales-export.ts";
import {
  countSupplierParcelsByStatus,
  getSupplierSalesSummary,
  getSupplierSalesTimeseries,
  type SupplierSalesScope,
} from "./supplier-panel-sales.ts";
import {
  getSupplierProductTimeseries,
  getSupplierSetupState,
  listSupplierProductOptions,
  listSupplierProductSales,
} from "./supplier-panel-sales-products.ts";

const database = createTestDatabase();

/** Fixed dates in the past, so parallel packages never share the range (section 10, trap 6). */
const RANGE = {
  from: new Date("2024-03-01T03:00:00Z"),
  to: new Date("2024-03-04T03:00:00Z"),
};
const SOLD: readonly OrderStatus[] = ["paid", "shipped", "delivered"];

let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let otherSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let secondProductId = "";
const stores: Record<string, string> = {};

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  for (const tenantId of [tenants.tenantA, tenants.tenantB]) {
    const store = await upsertStoreConnection(database, testStoreInput(tenantId, randomUUID()));
    stores[tenantId] = store.id;
  }
  supplier = await createTestSupplierProduct(database, {
    sku: `SALES-${randomUUID()}`,
    title: "Vestido midi",
    costCents: 4000,
    suggestedPriceCents: 9000,
    stock: 30,
  });
  // Five units held by paid orders not yet shipped: 25 left to sell.
  await database
    .update(supplierProducts)
    .set({ reservedStock: 5 })
    .where(eq(supplierProducts.id, supplier.productId));
  const [second] = await database
    .insert(supplierProducts)
    .values({
      supplierId: supplier.supplierId,
      sku: `SALES-2-${randomUUID()}`,
      title: "Blusa de linho",
      costCents: 2500,
      suggestedPriceCents: 6000,
      stock: 8,
      imageUrls: ["https://example.com/blusa.jpg"],
    })
    .returning({ id: supplierProducts.id });
  secondProductId = second?.id ?? "";
  otherSupplier = await createTestSupplierProduct(database, {
    sku: `SALES-OTHER-${randomUUID()}`,
    title: "Copo",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  await sale({
    tenantId: tenants.tenantA,
    day: 1,
    hour: 16,
    status: "paid",
    lines: [[supplier.productId, 2]],
  });
  await sale({
    tenantId: tenants.tenantA,
    day: 1,
    status: "delivered",
    lines: [
      [supplier.productId, 1],
      [secondProductId, 3],
    ],
    parcel: "delivered",
  });
  await sale({
    tenantId: tenants.tenantB,
    day: 3,
    status: "shipped",
    lines: [[secondProductId, 1]],
    parcel: "shipped",
  });
  await sale({
    tenantId: tenants.tenantB,
    day: 2,
    status: "cancelled",
    lines: [[supplier.productId, 4]],
    parcel: "cancelled",
  });
  await sale({
    tenantId: tenants.tenantB,
    day: 2,
    status: "pending",
    lines: [[supplier.productId, 9]],
  });
  await sale({
    tenantId: tenants.tenantA,
    day: 2,
    status: "paid",
    lines: [[otherSupplier.productId, 7]],
    parcel: "forwarded",
    parcelSupplierId: otherSupplier.supplierId,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await otherSupplier.cleanup();
  await database.$client.end();
});

/** One order of `tenantId` on March `day` (2024, Brazil midday), with items and maybe a parcel. */
async function sale(input: {
  tenantId: string;
  day: number;
  hour?: number;
  status: OrderStatus;
  lines: [productId: string, quantity: number][];
  parcel?: FulfillmentStatus;
  parcelSupplierId?: string;
  /** Exact dates, for a sale outside the March days. */
  dates?: { orderedAt: Date; paidAt: Date | null; reversedAt?: Date };
}): Promise<string> {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: input.tenantId,
      storeConnectionId: stores[input.tenantId] ?? "",
      externalOrderId: `ORD-${randomUUID()}`,
      status: input.status,
      totalCents: 99_999,
      orderedAt:
        input.dates?.orderedAt ?? new Date(`2024-03-0${input.day}T${input.hour ?? 15}:00:00Z`),
      paidAt: input.dates?.paidAt ?? null,
      reversedAt: input.dates?.reversedAt ?? null,
    })
    .returning({ id: orders.id });
  const orderId = order?.id ?? "";
  await database.insert(orderItems).values(
    input.lines.map(([productId, quantity]) => ({
      tenantId: input.tenantId,
      orderId,
      supplierProductId: productId,
      title: "Título do anúncio do revendedor",
      quantity,
      unitPriceCents: 99_999,
      unitCostCents: costOf(productId),
    })),
  );
  if (input.parcel === undefined) {
    return orderId;
  }
  await database.insert(orderShipments).values({
    tenantId: input.tenantId,
    orderId,
    supplierId: input.parcelSupplierId ?? supplier.supplierId,
    status: input.parcel,
    address: testAddress,
    items: [],
  });
  return orderId;
}

function costOf(productId: string): number {
  if (productId === secondProductId) {
    return 2500;
  }
  return productId === supplier.productId ? 4000 : 1000;
}

function scope(overrides: Partial<SupplierSalesScope> = {}): SupplierSalesScope {
  return { supplierId: supplier.supplierId, range: RANGE, statuses: SOLD, ...overrides };
}

describe("getSupplierSalesSummary", () => {
  it("counts the supplier's paid sales at its own price, across resellers", async () => {
    const summary = await getSupplierSalesSummary(database, scope());
    // 3 vestidos at 40 and 4 blusas at 25; cancelled, unpaid and other suppliers stay out.
    expect(summary).toEqual({
      orders: 3,
      units: 7,
      receivableCents: 3 * 4000 + 4 * 2500,
      resellers: 2,
      averageOrderCents: Math.round(22_000 / 3),
      undoneEarlierOrders: 0,
      undoneEarlierReceivableCents: 0,
    });
  });

  it("reads only cancelled and returned orders under that situation", async () => {
    const summary = await getSupplierSalesSummary(
      database,
      scope({ statuses: ["cancelled", "returned"] }),
    );
    expect(summary).toMatchObject({ orders: 1, units: 4, receivableCents: 16_000, resellers: 1 });
  });

  it("narrows to one product", async () => {
    const summary = await getSupplierSalesSummary(
      database,
      scope({ supplierProductId: secondProductId }),
    );
    expect(summary).toMatchObject({ orders: 2, units: 4, receivableCents: 10_000 });
  });

  it("keeps each supplier's sales apart on orders of the same resellers", async () => {
    const summary = await getSupplierSalesSummary(
      database,
      scope({ supplierId: otherSupplier.supplierId }),
    );
    expect(summary).toMatchObject({ orders: 1, units: 7, receivableCents: 7000, resellers: 1 });
  });
});

describe("sales paid after the month they were placed in", () => {
  it("count in the month the payment came in", async () => {
    const april = { from: new Date("2024-04-01T03:00:00Z"), to: new Date("2024-05-01T03:00:00Z") };
    const may = { from: new Date("2024-05-01T03:00:00Z"), to: new Date("2024-06-01T03:00:00Z") };
    await sale({
      tenantId: tenants.tenantA,
      day: 1,
      status: "paid",
      lines: [[supplier.productId, 1]],
      dates: {
        orderedAt: new Date("2024-04-29T15:00:00Z"),
        paidAt: new Date("2024-05-02T15:00:00Z"),
      },
    });

    const inApril = await getSupplierSalesSummary(database, scope({ range: april }));
    const inMay = await getSupplierSalesSummary(database, scope({ range: may }));
    const mayLines = await exportSupplierSaleLines(database, scope({ range: may }));

    expect(inApril.orders).toBe(0);
    expect(inMay).toMatchObject({ orders: 1, units: 1, receivableCents: 4000 });
    expect(mayLines.map((line) => line.paidAt?.toISOString())).toEqual([
      "2024-05-02T15:00:00.000Z",
    ]);
  });
});

describe("a sale cancelled in the month after it was paid", () => {
  const june = { from: new Date("2024-06-01T03:00:00Z"), to: new Date("2024-07-01T03:00:00Z") };
  const july = { from: new Date("2024-07-01T03:00:00Z"), to: new Date("2024-08-01T03:00:00Z") };
  const LOST: readonly OrderStatus[] = ["cancelled", "returned"];

  beforeAll(async () => {
    // Paid on 20 June, cancelled on 3 July: June keeps the sale, July takes it back.
    await sale({
      tenantId: tenants.tenantA,
      day: 1,
      status: "cancelled",
      lines: [[supplier.productId, 2]],
      dates: {
        orderedAt: new Date("2024-06-20T15:00:00Z"),
        paidAt: new Date("2024-06-20T15:00:00Z"),
        reversedAt: new Date("2024-07-03T15:00:00Z"),
      },
    });
  });

  it("keeps counting in June, which had ended when it was cancelled", async () => {
    const inJune = await getSupplierSalesSummary(database, scope({ range: june }));
    const lostInJune = await getSupplierSalesSummary(
      database,
      scope({ range: june, statuses: LOST }),
    );

    expect(inJune).toMatchObject({ orders: 1, units: 2, receivableCents: 8000 });
    expect(lostInJune.orders).toBe(0);
  });

  it("is taken back in July, the month it was cancelled", async () => {
    const inJuly = await getSupplierSalesSummary(database, scope({ range: july }));
    const days = await getSupplierSalesTimeseries(database, scope({ range: july }), "day");
    const lines = await exportSupplierSaleLines(database, scope({ range: july }));

    expect(inJuly).toMatchObject({
      orders: 0,
      units: -2,
      receivableCents: -8000,
      undoneEarlierOrders: 1,
      undoneEarlierReceivableCents: 8000,
      averageOrderCents: null,
    });
    expect(days.find((point) => point.date === "2024-07-03")?.receivableCents).toBe(-8000);
    expect(lines).toMatchObject([
      { status: "cancelled", fromEarlierPeriod: true, quantity: -2, receivableCents: -8000 },
    ]);
  });

  it("is listed among July's lost orders, at its value", async () => {
    const lostInJuly = await getSupplierSalesSummary(
      database,
      scope({ range: july, statuses: LOST }),
    );

    expect(lostInJuly).toMatchObject({ orders: 1, receivableCents: 8000, undoneEarlierOrders: 0 });
  });

  it("leaves July's best sellers without a product that only came back", async () => {
    const products = await listSupplierProductSales(database, scope({ range: july }), 5);

    expect(products).toEqual([]);
  });
});

describe("getSupplierSalesTimeseries", () => {
  it("fills every day of the range, empty ones at zero", async () => {
    const points = await getSupplierSalesTimeseries(database, scope(), "day");
    expect(points).toEqual([
      { date: "2024-03-01", orders: 2, units: 6, receivableCents: 3 * 4000 + 3 * 2500 },
      { date: "2024-03-02", orders: 0, units: 0, receivableCents: 0 },
      { date: "2024-03-03", orders: 1, units: 1, receivableCents: 2500 },
    ]);
  });
});

describe("listSupplierProductSales", () => {
  it("ranks the products by units, with the sellable stock and the main photo", async () => {
    const products = await listSupplierProductSales(database, scope(), 5);
    expect(products.map((product) => [product.title, product.units])).toEqual([
      ["Blusa de linho", 4],
      ["Vestido midi", 3],
    ]);
    expect(products[0]).toMatchObject({
      availableStock: 8,
      imageUrl: "https://example.com/blusa.jpg",
    });
    expect(products[1]).toMatchObject({ availableStock: 25, imageUrl: null });
  });
});

describe("getSupplierProductTimeseries", () => {
  it("returns each product's units on the days it sold", async () => {
    const points = await getSupplierProductTimeseries(database, scope(), {
      bucket: "day",
      productIds: [secondProductId],
    });
    expect(points).toEqual([
      { date: "2024-03-01", productId: secondProductId, units: 3, receivableCents: 7500 },
      { date: "2024-03-03", productId: secondProductId, units: 1, receivableCents: 2500 },
    ]);
  });
});

describe("listSupplierProductOptions", () => {
  it("lists only the supplier's own products, by name", async () => {
    const options = await listSupplierProductOptions(database, supplier.supplierId);
    expect(options.map((option) => option.title)).toEqual(["Blusa de linho", "Vestido midi"]);
  });
});

describe("countSupplierParcelsByStatus", () => {
  it("counts this supplier's settled parcels of the range", async () => {
    const rows = await countSupplierParcelsByStatus(database, {
      supplierId: supplier.supplierId,
      range: RANGE,
    });
    const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.parcels]));
    expect(byStatus).toEqual({ delivered: 1, shipped: 1, cancelled: 1 });
  });

  it("ignores another supplier's product as a filter", async () => {
    const rows = await countSupplierParcelsByStatus(database, {
      supplierId: supplier.supplierId,
      range: RANGE,
      supplierProductId: otherSupplier.productId,
    });
    expect(rows).toEqual([]);
  });

  it("counts a parcel still open even when its order is older than the range", async () => {
    const later = { from: new Date("2024-03-03T03:00:00Z"), to: RANGE.to };
    const rows = await countSupplierParcelsByStatus(database, {
      supplierId: otherSupplier.supplierId,
      range: later,
    });
    // The other supplier's parcel is from March 2nd and still waits for the accept.
    expect(rows).toEqual([{ status: "forwarded", parcels: 1 }]);
  });
});

describe("exportSupplierSaleLines", () => {
  it("lists each sold item with the supplier's own title and amount, oldest first", async () => {
    const lines = await exportSupplierSaleLines(database, scope());
    expect(
      lines.map((line) => [line.status, line.title, line.quantity, line.receivableCents]),
    ).toEqual([
      ["delivered", "Blusa de linho", 3, 7500],
      ["delivered", "Vestido midi", 1, 4000],
      ["paid", "Vestido midi", 2, 8000],
      ["shipped", "Blusa de linho", 1, 2500],
    ]);
  });
});

describe("getSupplierSetupState", () => {
  it("counts the catalog's steps and finds the first sale", async () => {
    const state = await getSupplierSetupState(database, supplier.supplierId);
    expect(state).toEqual({
      products: 2,
      submitted: 2,
      approved: 2,
      hasSales: true,
      paymentAccountReady: false,
    });
  });

  it("sees a draft as the first step only", async () => {
    const fresh = await createTestSupplierProduct(database, {
      sku: `SALES-DRAFT-${randomUUID()}`,
      title: "Saia",
      costCents: 3000,
      suggestedPriceCents: 7000,
    });
    await database
      .update(supplierProducts)
      .set({ reviewStatus: "draft" })
      .where(eq(supplierProducts.id, fresh.productId));
    try {
      // An unpaid order is not a first sale yet.
      await sale({
        tenantId: tenants.tenantA,
        day: 2,
        status: "pending",
        lines: [[fresh.productId, 1]],
      });
      const state = await getSupplierSetupState(database, fresh.supplierId);
      expect(state).toEqual({
        products: 1,
        submitted: 0,
        approved: 0,
        hasSales: false,
        paymentAccountReady: false,
      });
    } finally {
      await fresh.cleanup();
    }
  });

  it("finds no first sale in an order cancelled before it was ever paid", async () => {
    const fresh = await createTestSupplierProduct(database, {
      sku: `SALES-UNPAID-${randomUUID()}`,
      title: "Bolsa",
      costCents: 3000,
      suggestedPriceCents: 7000,
    });
    try {
      const orderId = await sale({
        tenantId: tenants.tenantA,
        day: 2,
        status: "cancelled",
        lines: [[fresh.productId, 1]],
      });
      await database.insert(orderStatusChanges).values([
        { tenantId: tenants.tenantA, orderId, status: "pending" },
        { tenantId: tenants.tenantA, orderId, status: "cancelled" },
      ]);
      expect((await getSupplierSetupState(database, fresh.supplierId)).hasSales).toBe(false);

      // Paid first and cancelled later, it was a sale: the dashboard replaces the first steps.
      await database
        .insert(orderStatusChanges)
        .values({ tenantId: tenants.tenantA, orderId, status: "paid" });
      expect((await getSupplierSetupState(database, fresh.supplierId)).hasSales).toBe(true);
    } finally {
      await fresh.cleanup();
    }
  });

  // Regression: the supplier home listed three steps to a first sale and never the account the
  // reseller pays through, so a supplier could finish them all and be paid outside SellBridge.
  it("sees the receiving account linked only once resellers can pay through it", async () => {
    const fresh = await createTestSupplierProduct(database, {
      sku: `SALES-ACCOUNT-${randomUUID()}`,
      title: "Sérum",
      costCents: 3500,
      suggestedPriceCents: 5290,
    });
    try {
      expect((await getSupplierSetupState(database, fresh.supplierId)).paymentAccountReady).toBe(
        false,
      );

      // An Asaas account still under Asaas's review cannot take a payment yet.
      await database.insert(supplierPaymentAccounts).values({
        supplierId: fresh.supplierId,
        provider: "asaas",
        reviewStatus: "pending",
      });
      expect((await getSupplierSetupState(database, fresh.supplierId)).paymentAccountReady).toBe(
        false,
      );

      await database
        .insert(supplierPaymentAccounts)
        .values({ supplierId: fresh.supplierId, provider: "mercado_pago" });
      expect((await getSupplierSetupState(database, fresh.supplierId)).paymentAccountReady).toBe(
        true,
      );
    } finally {
      await fresh.cleanup();
    }
  });
});
