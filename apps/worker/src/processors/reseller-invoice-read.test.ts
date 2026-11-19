import { schema } from "@sellbridge/database";
import {
  createInvoiceScenario,
  TEST_SUPPLIER_FISCAL,
} from "@sellbridge/database/testing/shipment-invoice";
import { marketplaceError } from "@sellbridge/marketplaces";
import type { MarketplaceSaleInvoice } from "@sellbridge/shared/reseller-invoice";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createWorkerTestEnvironment } from "../testing/fixtures.ts";
import { createResellerInvoiceReadProcessor } from "./reseller-invoice-read.ts";

const { database } = createWorkerTestEnvironment();
const cleanups: (() => Promise<void>)[] = [];

/** The fixture reseller's own NF-e (CNPJ 45.723.174/0001-10), number 78. */
const RESELLER_KEY = "35261145723174000110550010000000781000000785";
/** A note of the supplier (CNPJ 11.222.333/0001-81), as if model A had been attached. */
const SUPPLIER_KEY = "35261111222333000181550010000048211123456789";
const NOW = new Date("2026-11-19T12:00:00Z");

type SaleInvoiceRead = () => Promise<MarketplaceSaleInvoice | null>;

async function scenario() {
  const created = await createInvoiceScenario(database, {
    supplierFiscal: { ...TEST_SUPPLIER_FISCAL, invoiceModel: "on_behalf" },
    marketplace: "mercado_livre",
  });
  cleanups.push(created.cleanup);
  return created;
}

function processor(read: SaleInvoiceRead) {
  return createResellerInvoiceReadProcessor({
    database,
    readSaleInvoice: async () => read(),
    now: () => NOW,
  });
}

async function noteOf(shipmentId: string) {
  const [row] = await database
    .select()
    .from(schema.shipmentResellerInvoices)
    .where(eq(schema.shipmentResellerInvoices.shipmentId, shipmentId));
  return row;
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

afterAll(async () => {
  await database.$client.end();
});

describe("reseller invoice read", () => {
  it("saves the reseller's note found on the marketplace's order", async () => {
    const { shipmentId } = await scenario();
    const issuedAt = new Date("2026-11-19T11:30:00Z");

    await processor(async () => ({ accessKey: RESELLER_KEY, issuedAt }))();

    expect(await noteOf(shipmentId)).toMatchObject({
      accessKey: RESELLER_KEY,
      number: "78",
      series: "1",
      source: "marketplace",
      issuedAt,
      problem: null,
    });
  });

  it("reads again in 5 minutes while the reseller has not sent the note", async () => {
    const { shipmentId } = await scenario();

    await processor(async () => null)();

    expect(await noteOf(shipmentId)).toMatchObject({
      accessKey: null,
      checks: 1,
      nextCheckAt: new Date("2026-11-19T12:05:00Z"),
      problem: null,
    });
  });

  it("does not take a note issued by another CNPJ, and tells the reseller why", async () => {
    const { shipmentId } = await scenario();

    await processor(async () => ({ accessKey: SUPPLIER_KEY, issuedAt: null }))();

    expect(await noteOf(shipmentId)).toMatchObject({
      accessKey: null,
      problem:
        "A nota anexada ao pedido no marketplace não serve. Esta nota foi emitida pelo CNPJ 11.222.333/0001-81. Use a nota emitida pela sua empresa, CNPJ 45.723.174/0001-10.",
    });
  });

  it("tries again later when the marketplace fails", async () => {
    const { shipmentId } = await scenario();

    await processor(async () => {
      throw marketplaceError("Mercado Livre fora do ar", { retryable: true });
    })();

    expect(await noteOf(shipmentId)).toMatchObject({ accessKey: null, checks: 1 });
  });
});
