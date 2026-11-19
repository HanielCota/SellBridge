import { randomUUID } from "node:crypto";
import { hasErrorCode } from "@sellbridge/shared/errors";
import { count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  orderShipments,
  orderStatusEnum,
  shipmentPayments,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { saveAdminSupplier } from "./admin-suppliers.ts";
import { countSupplierShipmentsByTab, listSupplierShipments } from "./supplier-panel-orders.ts";
import { getSupplierSalesSummary } from "./supplier-panel-sales.ts";
import {
  advanceSupplierTestOrder,
  createSupplierTestOrder,
  deleteSupplierTestOrder,
  getSupplierTestOrder,
} from "./supplier-test-orders.ts";

const database = createTestDatabase();
const supplierIds: string[] = [];
const NOW = new Date("2026-11-17T12:00:00Z");
const DISPATCH_HOURS = 48;

async function newSupplier(): Promise<string> {
  const supplier = await saveAdminSupplier(database, {
    name: `Pedido de teste ${randomUUID()}`,
    niche: "Teste",
    description: "",
    state: "SP",
    city: "São Paulo",
    logoUrl: null,
    contactEmail: null,
    acceptWithinHours: 24,
    dispatchWithinHours: DISPATCH_HOURS,
  });
  supplierIds.push(supplier.id);
  return supplier.id;
}

async function newProduct(supplierId: string, title: string, createdAt: Date) {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `TST-${randomUUID().slice(0, 8)}`,
      title,
      costCents: 1500,
      suggestedPriceCents: 3990,
      stock: 5,
      createdAt,
    })
    .returning({ id: supplierProducts.id, sku: supplierProducts.sku });
  if (product === undefined) {
    throw new Error("test product not created");
  }
  return product;
}

/** Walks the test order from where it is to delivered, one click per step. */
async function walkToDelivered(supplierId: string, testOrderId: string) {
  const steps = ["received", "accepted", "label_printed", "picked", "shipped"] as const;
  for (const from of steps) {
    await advanceSupplierTestOrder(database, { supplierId, testOrderId, from, now: NOW });
  }
}

let supplierId = "";
let otherSupplierId = "";

beforeAll(async () => {
  supplierId = await newSupplier();
  otherSupplierId = await newSupplier();
});

afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.id, supplierIds));
  await database.$client.end();
});

describe("createSupplierTestOrder", () => {
  it("uses the supplier's newest product and its own dispatch window", async () => {
    const supplier = await newSupplier();
    await newProduct(supplier, "Bolsa antiga", new Date("2026-01-01T00:00:00Z"));
    const newest = await newProduct(supplier, "Bolsinha Infantil Preto", NOW);

    const created = await createSupplierTestOrder(database, { supplierId: supplier, now: NOW });

    expect(created).toMatchObject({
      supplierId: supplier,
      supplierProductId: newest.id,
      productTitle: "Bolsinha Infantil Preto",
      productSku: newest.sku,
      step: "received",
      dispatchDeadlineAt: new Date(NOW.getTime() + DISPATCH_HOURS * 3_600_000),
    });
  });

  it("uses a sample product when the supplier has none", async () => {
    const supplier = await newSupplier();

    const created = await createSupplierTestOrder(database, { supplierId: supplier, now: NOW });

    expect(created).toMatchObject({
      supplierProductId: null,
      productTitle: "Produto de exemplo",
      productSku: "EXEMPLO",
    });
  });

  it("refuses a second test order while the first exists", async () => {
    const supplier = await newSupplier();
    await createSupplierTestOrder(database, { supplierId: supplier, now: NOW });

    const second = createSupplierTestOrder(database, { supplierId: supplier, now: NOW });

    await expect(second).rejects.toSatisfy((error) => hasErrorCode(error, "CONFLICT"));
  });
});

describe("advanceSupplierTestOrder", () => {
  it("walks every step in order and dates each one", async () => {
    const supplier = await newSupplier();
    const created = await createSupplierTestOrder(database, { supplierId: supplier, now: NOW });

    await walkToDelivered(supplier, created.id);

    const delivered = await getSupplierTestOrder(database, supplier);
    expect(delivered).toMatchObject({
      step: "delivered",
      acceptedAt: NOW,
      labelPrintedAt: NOW,
      pickedAt: NOW,
      shippedAt: NOW,
      deliveredAt: NOW,
    });
  });

  it("advances once when the same step is clicked twice", async () => {
    const supplier = await newSupplier();
    const created = await createSupplierTestOrder(database, { supplierId: supplier, now: NOW });
    const input = {
      supplierId: supplier,
      testOrderId: created.id,
      from: "received",
      now: NOW,
    } as const;
    await advanceSupplierTestOrder(database, input);

    const again = advanceSupplierTestOrder(database, input);

    await expect(again).rejects.toSatisfy((error) => hasErrorCode(error, "CONFLICT"));
    expect((await getSupplierTestOrder(database, supplier))?.step).toBe("accepted");
  });

  it("stops at delivered", async () => {
    const supplier = await newSupplier();
    const created = await createSupplierTestOrder(database, { supplierId: supplier, now: NOW });
    await walkToDelivered(supplier, created.id);

    const past = advanceSupplierTestOrder(database, {
      supplierId: supplier,
      testOrderId: created.id,
      from: "delivered",
      now: NOW,
    });

    await expect(past).rejects.toSatisfy((error) => hasErrorCode(error, "CONFLICT"));
  });
});

describe("another supplier", () => {
  it("never sees, advances or deletes someone else's test order", async () => {
    const created = await createSupplierTestOrder(database, { supplierId, now: NOW });

    const seen = await getSupplierTestOrder(database, otherSupplierId);
    const advance = await advanceSupplierTestOrder(database, {
      supplierId: otherSupplierId,
      testOrderId: created.id,
      from: "received",
      now: NOW,
    }).catch((error: unknown) => error);
    const remove = await deleteSupplierTestOrder(database, {
      supplierId: otherSupplierId,
      testOrderId: created.id,
    }).catch((error: unknown) => error);

    expect(seen).toBeNull();
    expect(hasErrorCode(advance, "NOT_FOUND")).toBe(true);
    expect(hasErrorCode(remove, "NOT_FOUND")).toBe(true);
    expect((await getSupplierTestOrder(database, supplierId))?.step).toBe("received");
    await deleteSupplierTestOrder(database, { supplierId, testOrderId: created.id });
  });
});

describe("deleteSupplierTestOrder", () => {
  it("removes the test order so a new one can be created", async () => {
    const supplier = await newSupplier();
    const created = await createSupplierTestOrder(database, { supplierId: supplier, now: NOW });

    await deleteSupplierTestOrder(database, { supplierId: supplier, testOrderId: created.id });

    expect(await getSupplierTestOrder(database, supplier)).toBeNull();
    await expect(
      createSupplierTestOrder(database, { supplierId: supplier, now: NOW }),
    ).resolves.toMatchObject({ step: "received" });
  });
});

describe("a test order stays out of the real flow", () => {
  it("creates no parcel, payment, queue entry or sale for the supplier", async () => {
    const supplier = await newSupplier();
    await newProduct(supplier, "Produto real", NOW);
    const created = await createSupplierTestOrder(database, { supplierId: supplier, now: NOW });
    await walkToDelivered(supplier, created.id);

    const [parcels] = await database
      .select({ value: count() })
      .from(orderShipments)
      .where(eq(orderShipments.supplierId, supplier));
    const [payments] = await database
      .select({ value: count() })
      .from(shipmentPayments)
      .where(eq(shipmentPayments.supplierId, supplier));
    const queue = await listSupplierShipments(database, {
      supplierId: supplier,
      tab: "closed",
      query: "",
      page: 1,
    });
    const tabs = await countSupplierShipmentsByTab(database, {
      supplierId: supplier,
      query: "",
    });
    const sales = await getSupplierSalesSummary(database, {
      supplierId: supplier,
      range: { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2027-01-01T00:00:00Z") },
      statuses: orderStatusEnum.enumValues,
    });

    expect(parcels?.value).toBe(0);
    expect(payments?.value).toBe(0);
    expect(queue.items).toEqual([]);
    expect(Object.values(tabs).every((value) => value === 0)).toBe(true);
    expect(sales).toMatchObject({ orders: 0, units: 0, receivableCents: 0 });
  });
});
