import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { shipmentInvoices, shipmentResellerInvoices, tenantProfile } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import {
  createInvoiceScenario,
  TEST_SUPPLIER_FISCAL,
} from "../testing/shipment-invoice-fixtures.ts";
import {
  findShipmentInvoiceFiles,
  findSupplierShipmentInvoice,
  markShipmentInvoiceAuthorized,
  queueNewShipmentInvoices,
  resellerShipmentInvoices,
} from "./shipment-invoices.ts";
import {
  loadOnBehalfInvoiceContext,
  queueOnBehalfInvoices,
} from "./shipment-on-behalf-invoices.ts";
import { queueResellerSaleInvoices } from "./shipment-reseller-invoices.ts";

const database = createTestDatabase();
const cleanups: (() => Promise<void>)[] = [];
/** A sale note of the scenario's reseller (CNPJ 45.723.174/0001-10). */
const RESELLER_KEY = "35261145723174000110550010000000771000000770";
const REMESSA_KEY = "31261111222333000181550010000012341000012345";

async function onBehalfScenario() {
  const created = await createInvoiceScenario(database, {
    supplierFiscal: { ...TEST_SUPPLIER_FISCAL, invoiceModel: "on_behalf" },
  });
  cleanups.push(created.cleanup);
  return created;
}

async function kindsOf(shipmentId: string) {
  const rows = await database
    .select({ kind: shipmentInvoices.kind })
    .from(shipmentInvoices)
    .where(eq(shipmentInvoices.shipmentId, shipmentId));
  return rows.map((row) => row.kind).toSorted();
}

async function findResellerNote(shipmentId: string, tenantId: string): Promise<void> {
  await database
    .insert(shipmentResellerInvoices)
    .values({
      shipmentId,
      tenantId,
      accessKey: RESELLER_KEY,
      number: "77",
      series: "1",
      source: "typed",
      foundAt: new Date(),
    })
    .onConflictDoUpdate({
      target: shipmentResellerInvoices.shipmentId,
      set: { accessKey: RESELLER_KEY, number: "77", series: "1", source: "typed" },
    });
}

async function authorizeRemessa(shipmentId: string): Promise<void> {
  await queueOnBehalfInvoices(database);
  const [remessa] = await database
    .select({ id: shipmentInvoices.id })
    .from(shipmentInvoices)
    .where(eq(shipmentInvoices.shipmentId, shipmentId));
  if (remessa === undefined) {
    throw new Error("remessa not queued");
  }
  await markShipmentInvoiceAuthorized(database, {
    invoiceId: remessa.id,
    number: "1234",
    series: "1",
    accessKey: REMESSA_KEY,
    danfeUrl: null,
    authorizedAt: new Date(),
  });
  await queueOnBehalfInvoices(database);
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

afterAll(async () => {
  await database.$client.end();
});

describe("venda à ordem notes", () => {
  it("gives a company reseller of a venda à ordem supplier no direct note", async () => {
    const { shipmentId } = await onBehalfScenario();

    await queueNewShipmentInvoices(database);
    await queueResellerSaleInvoices(database);

    expect(await kindsOf(shipmentId)).toEqual([]);
    const [resellerNote] = await database
      .select({ id: shipmentResellerInvoices.id })
      .from(shipmentResellerInvoices)
      .where(eq(shipmentResellerInvoices.shipmentId, shipmentId));
    expect(resellerNote).toBeDefined();
  });

  it("keeps a reseller who sells with a CPF on the supplier's direct note", async () => {
    const { shipmentId, tenantId } = await onBehalfScenario();
    await database
      .update(tenantProfile)
      .set({ cnpj: null, companyName: null })
      .where(eq(tenantProfile.tenantId, tenantId));

    await queueNewShipmentInvoices(database);
    await queueResellerSaleInvoices(database);

    expect(await kindsOf(shipmentId)).toEqual(["direct"]);
  });

  it("keeps a parcel on its direct note when the reseller becomes a company later", async () => {
    const { shipmentId, tenantId } = await onBehalfScenario();
    await database
      .update(tenantProfile)
      .set({ cnpj: null, companyName: null })
      .where(eq(tenantProfile.tenantId, tenantId));
    await queueNewShipmentInvoices(database);
    await database
      .update(tenantProfile)
      .set({ cnpj: "45723174000110", companyName: "Revenda Teste Ltda" })
      .where(eq(tenantProfile.tenantId, tenantId));

    await queueResellerSaleInvoices(database);
    await queueNewShipmentInvoices(database);

    const resellerNotes = await database
      .select({ id: shipmentResellerInvoices.id })
      .from(shipmentResellerInvoices)
      .where(eq(shipmentResellerInvoices.shipmentId, shipmentId));
    expect(resellerNotes).toEqual([]);
    expect(await kindsOf(shipmentId)).toEqual(["direct"]);
  });

  it("opens the remessa once the reseller's note is found, and the sale once it is authorized", async () => {
    const { shipmentId, tenantId } = await onBehalfScenario();
    await queueResellerSaleInvoices(database);
    await queueOnBehalfInvoices(database);
    const beforeNote = await kindsOf(shipmentId);
    await findResellerNote(shipmentId, tenantId);

    await queueOnBehalfInvoices(database);
    const afterNote = await kindsOf(shipmentId);
    await authorizeRemessa(shipmentId);

    expect(beforeNote).toEqual([]);
    expect(afterNote).toEqual(["on_behalf_shipment"]);
    expect(await kindsOf(shipmentId)).toEqual(["on_behalf_sale", "on_behalf_shipment"]);
  });

  it("shows the remessa, the note in the box, on the order screens", async () => {
    const { shipmentId, tenantId, supplierId } = await onBehalfScenario();
    await findResellerNote(shipmentId, tenantId);
    await authorizeRemessa(shipmentId);

    const supplierView = await findSupplierShipmentInvoice(database, { supplierId, shipmentId });
    const resellerView = await resellerShipmentInvoices(database, [shipmentId]);
    const files = await findShipmentInvoiceFiles(database, shipmentId);

    expect(supplierView?.accessKey).toBe(REMESSA_KEY);
    expect(resellerView.get(shipmentId)?.accessKey).toBe(REMESSA_KEY);
    expect(files?.accessKey).toBe(REMESSA_KEY);
  });

  it("loads the reseller's note, the remessa and the reseller's company for the next note", async () => {
    const { shipmentId, tenantId, supplierId } = await onBehalfScenario();
    await findResellerNote(shipmentId, tenantId);
    await authorizeRemessa(shipmentId);

    const context = await loadOnBehalfInvoiceContext(database, {
      shipmentId,
      tenantId,
      supplierId,
    });

    expect(context).toMatchObject({
      resellerNote: { accessKey: RESELLER_KEY, number: "77", series: "1" },
      shipmentNote: { accessKey: REMESSA_KEY, number: "1234" },
      reseller: { cnpj: "45723174000110", legalName: "Revenda Teste Ltda" },
      shipmentOperationId: null,
      saleOperationId: null,
    });
  });
});
