import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestSupplierProduct } from "../testing/fixtures.ts";
import { setSupplierStoreOpen, SUPPLIER_OFF_STORE_MESSAGE } from "./supplier-store-open.ts";

const database = createTestDatabase();
const cleanups: (() => Promise<void>)[] = [];

afterAll(async () => {
  for (const cleanup of cleanups) {
    await cleanup();
  }
  await database.$client.end();
});

async function newSupplierId(): Promise<string> {
  const sku = `LOJA-${randomUUID().slice(0, 8)}`;
  const catalog = await createTestSupplierProduct(database, {
    sku,
    title: `Produto ${sku}`,
    costCents: 1500,
    suggestedPriceCents: 3990,
    stock: 5,
  });
  cleanups.push(catalog.cleanup);
  return catalog.supplierId;
}

async function closedAtOf(supplierId: string): Promise<Date | null | undefined> {
  const [row] = await database
    .select({ salesClosedAt: suppliers.salesClosedAt })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId));
  return row?.salesClosedAt;
}

describe("setSupplierStoreOpen", () => {
  const firstClose = new Date("2026-11-05T15:00:00Z");

  it("records when the store closed and clears it on opening", async () => {
    const supplierId = await newSupplierId();

    const closed = await setSupplierStoreOpen(database, {
      supplierId,
      open: false,
      now: firstClose,
    });
    const reopened = await setSupplierStoreOpen(database, {
      supplierId,
      open: true,
      now: firstClose,
    });

    expect(closed.salesClosedAt).toEqual(firstClose);
    expect(reopened.salesClosedAt).toBeNull();
    expect(await closedAtOf(supplierId)).toBeNull();
  });

  it("keeps the first closing time when the store is closed twice", async () => {
    const supplierId = await newSupplierId();
    await setSupplierStoreOpen(database, { supplierId, open: false, now: firstClose });

    const again = await setSupplierStoreOpen(database, {
      supplierId,
      open: false,
      now: new Date("2026-11-06T09:00:00Z"),
    });

    expect(again.salesClosedAt).toEqual(firstClose);
  });

  it("refuses a supplier the team switched off, which only the team brings back", async () => {
    const supplierId = await newSupplierId();
    await database.update(suppliers).set({ active: false }).where(eq(suppliers.id, supplierId));

    await expect(
      setSupplierStoreOpen(database, { supplierId, open: true, now: firstClose }),
    ).rejects.toThrow(SUPPLIER_OFF_STORE_MESSAGE);
  });

  it("refuses a supplier that does not exist", async () => {
    await expect(
      setSupplierStoreOpen(database, { supplierId: randomUUID(), open: false, now: firstClose }),
    ).rejects.toThrow("Fornecedor não encontrado");
  });
});
