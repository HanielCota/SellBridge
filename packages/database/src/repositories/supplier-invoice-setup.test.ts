import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { supplierErpConnections } from "../schema/index.ts";
import { createTestDatabase, createTestSupplierProduct } from "../testing/fixtures.ts";
import { isOnBehalfInvoiceOff } from "./supplier-invoice-setup.ts";

const database = createTestDatabase();
const cleanups: (() => Promise<void>)[] = [];
let supplierId = "";

beforeEach(async () => {
  const supplier = await createTestSupplierProduct(database, {
    sku: `NOTA-${crypto.randomUUID()}`,
    title: "Luminária",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  cleanups.push(supplier.cleanup);
  supplierId = supplier.supplierId;
});

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
  await database.$client.end();
});

async function chooseInvoiceModel(model: "direct" | "on_behalf") {
  await database.execute(
    sql`update suppliers set fiscal_profile = jsonb_build_object('invoiceModel', ${model}::text) where id = ${supplierId}`,
  );
}

async function connectBling(invoiceEnabled: boolean) {
  await database.insert(supplierErpConnections).values({
    supplierId,
    provider: "bling",
    accessTokenEnc: "enc-access",
    refreshTokenEnc: "enc-refresh",
    expiresAt: new Date(Date.now() + 3_600_000),
    invoiceEnabledAt: invoiceEnabled ? new Date() : null,
  });
}

describe("isOnBehalfInvoiceOff", () => {
  it("warns when venda à ordem is chosen and the Bling note is off", async () => {
    await chooseInvoiceModel("on_behalf");
    await connectBling(false);

    expect(await isOnBehalfInvoiceOff(database, supplierId)).toBe(true);
  });

  it("warns when venda à ordem is chosen and no Bling is connected", async () => {
    await chooseInvoiceModel("on_behalf");

    expect(await isOnBehalfInvoiceOff(database, supplierId)).toBe(true);
  });

  it("stays quiet once the Bling issues the notes", async () => {
    await chooseInvoiceModel("on_behalf");
    await connectBling(true);

    expect(await isOnBehalfInvoiceOff(database, supplierId)).toBe(false);
  });

  it("warns again when the connected Bling that issued the notes was disconnected", async () => {
    await chooseInvoiceModel("on_behalf");
    await connectBling(true);
    await database
      .update(supplierErpConnections)
      .set({ status: "disconnected" })
      .where(eq(supplierErpConnections.supplierId, supplierId));

    expect(await isOnBehalfInvoiceOff(database, supplierId)).toBe(true);
  });

  it("says nothing about a supplier that sends the note directly", async () => {
    await chooseInvoiceModel("direct");

    expect(await isOnBehalfInvoiceOff(database, supplierId)).toBe(false);
  });
});
