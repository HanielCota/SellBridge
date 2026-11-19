import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { supplierErpConnections, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import {
  applyErpStockReadings,
  claimErpStockRefreshRequests,
  deleteErpStockRefreshRequestsBefore,
  findErpStockAccount,
  findErpStockSuppliersByCompany,
  linkErpProducts,
  listErpStockAccounts,
  listUnlinkedErpSkus,
  recordErpStockCheckFailure,
  recordErpStockNotice,
  unlinkErpProducts,
} from "./erp-stock.ts";

const database = createTestDatabase();
const createdSuppliers: string[] = [];

afterEach(async () => {
  for (const id of createdSuppliers.splice(0)) {
    await database.delete(suppliers).where(eq(suppliers.id, id));
  }
});

async function createSupplier(options: { invoiceEnabled: boolean; companyId?: string }) {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: "Fornecedor estoque Bling", niche: "Teste", state: "ZZ", city: "X" })
    .returning({ id: suppliers.id });
  if (supplier === undefined) {
    throw new Error("supplier not created");
  }
  createdSuppliers.push(supplier.id);
  const [connection] = await database
    .insert(supplierErpConnections)
    .values({
      supplierId: supplier.id,
      provider: "bling",
      accessTokenEnc: "enc-access",
      refreshTokenEnc: "enc-refresh",
      expiresAt: new Date(Date.now() + 3_600_000),
      invoiceEnabledAt: options.invoiceEnabled ? new Date() : null,
      erpCompanyId: options.companyId ?? null,
    })
    .returning({ id: supplierErpConnections.id });
  if (connection === undefined) {
    throw new Error("connection not created");
  }
  return { supplierId: supplier.id, connectionId: connection.id };
}

async function createProduct(
  supplierId: string,
  input: { sku: string; stock: number; erpProductId?: number | null; title?: string },
) {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: input.sku,
      title: input.title ?? `Produto ${input.sku}`,
      costCents: 1000,
      suggestedPriceCents: 2000,
      stock: input.stock,
      erpProductId: input.erpProductId ?? null,
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) {
    throw new Error("product not created");
  }
  return product.id;
}

async function productRow(productId: string) {
  const [row] = await database
    .select({
      stock: supplierProducts.stock,
      title: supplierProducts.title,
      erpProductId: supplierProducts.erpProductId,
      erpStockReadAt: supplierProducts.erpStockReadAt,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productId));
  return row;
}

describe("ERP stock accounts", () => {
  it("follows Bling for every connected supplier, with or without the NF-e through SellBridge", async () => {
    const companyId = `company-${randomUUID()}`;
    const invoicing = await createSupplier({ invoiceEnabled: true, companyId });
    const notInvoicing = await createSupplier({ invoiceEnabled: false, companyId });

    const accounts = await listErpStockAccounts(database);
    const byCompany = await findErpStockSuppliersByCompany(database, companyId);

    const listed = accounts.map((account) => account.supplierId);
    expect(listed).toContain(invoicing.supplierId);
    expect(listed).toContain(notInvoicing.supplierId);
    expect(byCompany.toSorted()).toEqual(
      [invoicing.supplierId, notInvoicing.supplierId].toSorted(),
    );
    expect(await findErpStockAccount(database, notInvoicing.supplierId)).not.toBeNull();
  });

  it("stops following an account once it is no longer connected", async () => {
    const account = await createSupplier({ invoiceEnabled: true });
    await database
      .update(supplierErpConnections)
      .set({ status: "expired" })
      .where(eq(supplierErpConnections.id, account.connectionId));

    expect(await findErpStockAccount(database, account.supplierId)).toBeNull();
  });

  it("counts failed checks in a row", async () => {
    const account = await createSupplier({ invoiceEnabled: true });

    await recordErpStockCheckFailure(database, account.connectionId);
    const streak = await recordErpStockCheckFailure(database, account.connectionId);

    expect(streak).toBe(2);
  });
});

describe("applyErpStockReadings", () => {
  it("writes only the stock of the linked product and reports the change", async () => {
    const { supplierId } = await createSupplier({ invoiceEnabled: true });
    const productId = await createProduct(supplierId, {
      sku: "A",
      stock: 10,
      erpProductId: 111,
      title: "Nome do fornecedor",
    });

    const changes = await applyErpStockReadings(database, {
      supplierId,
      readAt: new Date("2026-11-19T12:00:00Z"),
      readings: [{ erpProductId: 111, stock: 3 }],
    });

    expect(changes).toEqual([
      { productId, sku: "A", previousStock: 10, stock: 3, reservedStock: 0 },
    ]);
    const row = await productRow(productId);
    expect(row?.stock).toBe(3);
    expect(row?.title).toBe("Nome do fornecedor");
  });

  it("keeps a newer reading when an older one finishes later", async () => {
    const { supplierId } = await createSupplier({ invoiceEnabled: true });
    const productId = await createProduct(supplierId, { sku: "A", stock: 10, erpProductId: 111 });
    await applyErpStockReadings(database, {
      supplierId,
      readAt: new Date("2026-11-19T12:00:05Z"),
      readings: [{ erpProductId: 111, stock: 2 }],
    });

    const changes = await applyErpStockReadings(database, {
      supplierId,
      readAt: new Date("2026-11-19T12:00:00Z"),
      readings: [{ erpProductId: 111, stock: 9 }],
    });

    expect(changes).toEqual([]);
    expect((await productRow(productId))?.stock).toBe(2);
  });

  it("reports nothing when the stock read equals the stock held", async () => {
    const { supplierId } = await createSupplier({ invoiceEnabled: true });
    await createProduct(supplierId, { sku: "A", stock: 4, erpProductId: 111 });

    const changes = await applyErpStockReadings(database, {
      supplierId,
      readAt: new Date(),
      readings: [{ erpProductId: 111, stock: 4 }],
    });

    expect(changes).toEqual([]);
  });

  it("never touches another supplier's product with the same Bling id", async () => {
    const first = await createSupplier({ invoiceEnabled: true });
    const second = await createSupplier({ invoiceEnabled: true });
    const otherProduct = await createProduct(second.supplierId, {
      sku: "A",
      stock: 7,
      erpProductId: 111,
    });

    await applyErpStockReadings(database, {
      supplierId: first.supplierId,
      readAt: new Date(),
      readings: [{ erpProductId: 111, stock: 0 }],
    });

    expect((await productRow(otherProduct))?.stock).toBe(7);
  });
});

describe("linking products to Bling", () => {
  it("links unlinked products by SKU and lists the ones still unlinked", async () => {
    const { supplierId } = await createSupplier({ invoiceEnabled: true });
    const linkedAlready = await createProduct(supplierId, { sku: "A", stock: 1, erpProductId: 5 });
    const toLink = await createProduct(supplierId, { sku: "B", stock: 1 });
    await createProduct(supplierId, { sku: "C", stock: 1 });

    const linked = await linkErpProducts(database, {
      supplierId,
      links: [
        { sku: "A", erpProductId: 999 },
        { sku: "B", erpProductId: 222 },
      ],
    });

    expect(linked).toBe(1);
    expect((await productRow(linkedAlready))?.erpProductId).toBe(5);
    expect((await productRow(toLink))?.erpProductId).toBe(222);
    expect(await listUnlinkedErpSkus(database, { supplierId, afterSku: null, limit: 10 })).toEqual([
      "C",
    ]);
  });

  it("unlinks ids Bling no longer has so their stock stops following it", async () => {
    const { supplierId } = await createSupplier({ invoiceEnabled: true });
    const productId = await createProduct(supplierId, { sku: "A", stock: 1, erpProductId: 5 });

    await unlinkErpProducts(database, { supplierId, erpProductIds: [5] });

    expect((await productRow(productId))?.erpProductId).toBeNull();
  });
});

describe("stock notices", () => {
  it("keeps one pending read per product however many times Bling repeats it", async () => {
    const { supplierId } = await createSupplier({ invoiceEnabled: true });

    await recordErpStockNotice(database, {
      supplierIds: [supplierId],
      erpProductIds: [111],
      receivedAt: new Date("2026-11-19T12:00:00Z"),
    });
    await recordErpStockNotice(database, {
      supplierIds: [supplierId],
      erpProductIds: [111, 222],
      receivedAt: new Date("2026-11-19T12:00:01Z"),
    });
    const claimed = await claimErpStockRefreshRequests(database, { supplierId, limit: 10 });
    const claimedAgain = await claimErpStockRefreshRequests(database, { supplierId, limit: 10 });

    expect(claimed.toSorted((first, second) => first - second)).toEqual([111, 222]);
    expect(claimedAgain).toEqual([]);
    const account = await findErpStockAccount(database, supplierId);
    expect(account?.lastStockNoticeAt?.toISOString()).toBe("2026-11-19T12:00:01.000Z");
  });

  it("drops the pending reads a full check already covered, not newer ones", async () => {
    const { supplierId } = await createSupplier({ invoiceEnabled: true });
    await recordErpStockNotice(database, {
      supplierIds: [supplierId],
      erpProductIds: [111],
      receivedAt: new Date("2026-11-19T12:00:00Z"),
    });
    await recordErpStockNotice(database, {
      supplierIds: [supplierId],
      erpProductIds: [222],
      receivedAt: new Date("2026-11-19T12:10:00Z"),
    });

    await deleteErpStockRefreshRequestsBefore(database, {
      supplierId,
      before: new Date("2026-11-19T12:05:00Z"),
    });

    expect(await claimErpStockRefreshRequests(database, { supplierId, limit: 10 })).toEqual([222]);
  });
});
