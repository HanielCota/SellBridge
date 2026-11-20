import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  orders,
  orderShipments,
  shipmentInvoices,
  shipmentResellerInvoices,
  tenantProfile,
} from "../schema/index.ts";
import { createTestDatabase, createTestUsers } from "../testing/fixtures.ts";
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
  claimOnBehalfRemessaDraft,
  findOnBehalfLabelParcels,
  findOnBehalfLabelState,
  releaseOnBehalfLabel,
  findResellerNoteState,
  loadOnBehalfInvoiceContext,
  queueOnBehalfInvoices,
} from "./shipment-on-behalf-invoices.ts";
import { queueResellerSaleInvoices } from "./shipment-reseller-invoices.ts";

const database = createTestDatabase();
const cleanups: (() => Promise<void>)[] = [];
/** A sale note of the scenario's reseller (CNPJ 45.723.174/0001-10). */
const RESELLER_KEY = "35261145723174000110550010000000771000000770";
const REMESSA_KEY = "31261111222333000181550010000012341000012345";
const SALE_KEY = "31261111222333000181550010000012351000012350";

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

  it("reads the sale to the reseller apart from the note in the box", async () => {
    const { shipmentId, tenantId, supplierId } = await onBehalfScenario();
    await findResellerNote(shipmentId, tenantId);
    await authorizeRemessa(shipmentId);
    const [sale] = await database
      .select({ id: shipmentInvoices.id })
      .from(shipmentInvoices)
      .where(
        and(
          eq(shipmentInvoices.shipmentId, shipmentId),
          eq(shipmentInvoices.kind, "on_behalf_sale"),
        ),
      );
    const beforeAuthorized = await findShipmentInvoiceFiles(database, shipmentId, "sale");
    await markShipmentInvoiceAuthorized(database, {
      invoiceId: sale?.id ?? "",
      number: "1235",
      series: "1",
      accessKey: SALE_KEY,
      danfeUrl: null,
      authorizedAt: new Date(),
    });

    const supplierView = await findSupplierShipmentInvoice(
      database,
      { supplierId, shipmentId },
      "sale",
    );
    const resellerView = await resellerShipmentInvoices(database, [shipmentId], "sale");
    const files = await findShipmentInvoiceFiles(database, shipmentId, "sale");

    expect(beforeAuthorized).toBeNull();
    expect(supplierView?.accessKey).toBe(SALE_KEY);
    expect(resellerView.get(shipmentId)?.number).toBe("1235");
    expect(files?.accessKey).toBe(SALE_KEY);
  });

  it("tells a venda à ordem parcel waiting for the reseller's note from a direct one", async () => {
    const onBehalf = await onBehalfScenario();
    const direct = await createInvoiceScenario(database);
    cleanups.push(direct.cleanup);
    await queueResellerSaleInvoices(database);

    const waiting = await findResellerNoteState(database, onBehalf.shipmentId);
    await findResellerNote(onBehalf.shipmentId, onBehalf.tenantId);

    expect(waiting).toEqual({ found: false });
    expect(await findResellerNoteState(database, onBehalf.shipmentId)).toEqual({ found: true });
    expect(await findResellerNoteState(database, direct.shipmentId)).toBeNull();
  });

  it("tells the label which notes of the order are in place", async () => {
    const { shipmentId, tenantId, orderId } = await onBehalfScenario();
    await queueResellerSaleInvoices(database);
    const waiting = await findOnBehalfLabelParcels(database, { tenantId, orderId });
    await findResellerNote(shipmentId, tenantId);
    await authorizeRemessa(shipmentId);

    const ready = await findOnBehalfLabelParcels(database, { tenantId, orderId });

    expect(waiting).toMatchObject([
      { resellerNoteSource: null, remessaAuthorized: false, labelReleased: false },
    ]);
    expect(ready).toMatchObject([
      { resellerNoteSource: "typed", remessaAuthorized: true, labelReleased: false },
    ]);
  });

  it("holds a cart's label while any order of the cart still waits for its notes", async () => {
    const { shipmentId, tenantId, orderId } = await onBehalfScenario();
    const packId = `pack-${crypto.randomUUID().slice(0, 8)}`;
    await database.update(orders).set({ marketplacePackId: packId }).where(eq(orders.id, orderId));
    const [orderA] = await database.select().from(orders).where(eq(orders.id, orderId));
    const [parcelA] = await database
      .select()
      .from(orderShipments)
      .where(eq(orderShipments.id, shipmentId));
    if (orderA === undefined || parcelA === undefined) {
      throw new Error("scenario order missing");
    }
    const { id: _orderAId, ...orderFields } = orderA;
    const [orderB] = await database
      .insert(orders)
      .values({ ...orderFields, externalOrderId: `${orderA.externalOrderId}-B` })
      .returning({ id: orders.id });
    const { id: _parcelAId, ...parcelFields } = parcelA;
    await database.insert(orderShipments).values({ ...parcelFields, orderId: orderB?.id ?? "" });
    await queueResellerSaleInvoices(database);
    await findResellerNote(shipmentId, tenantId);
    await authorizeRemessa(shipmentId);

    const parcels = await findOnBehalfLabelParcels(database, { tenantId, orderId });

    expect(parcels).toHaveLength(2);
    expect(parcels).toContainEqual({
      shipmentId: expect.any(String) as unknown,
      orderId: expect.any(String) as unknown,
      resellerNoteSource: null,
      remessaAuthorized: false,
      labelReleased: false,
    });
  });

  it("keeps who released a stuck label, when and why, and lets the label count it", async () => {
    const { shipmentId, tenantId, orderId } = await onBehalfScenario();
    await queueResellerSaleInvoices(database);
    const users = await createTestUsers(database, 1);
    cleanups.push(users.cleanup);
    const userId = users.ids[0] ?? "";
    const now = new Date("2026-11-20T15:00:00Z");

    await releaseOnBehalfLabel(database, {
      shipmentId,
      userId,
      reason: "Bling do fornecedor fora do ar há 3 dias",
      now,
    });

    const state = await findOnBehalfLabelState(database, shipmentId);
    expect(state?.release).toMatchObject({
      at: now,
      reason: "Bling do fornecedor fora do ar há 3 dias",
    });
    expect(state?.release?.byName).not.toBeNull();
    expect(await findOnBehalfLabelParcels(database, { tenantId, orderId })).toMatchObject([
      { resellerNoteSource: null, remessaAuthorized: false, labelReleased: true },
    ]);
  });

  it("refuses to release a label twice, or one of a parcel not sold in venda à ordem", async () => {
    const { shipmentId } = await onBehalfScenario();
    const direct = await createInvoiceScenario(database);
    cleanups.push(direct.cleanup);
    await queueResellerSaleInvoices(database);
    const users = await createTestUsers(database, 1);
    cleanups.push(users.cleanup);
    const release = { userId: users.ids[0] ?? "", reason: "Remessa recusada", now: new Date() };
    await releaseOnBehalfLabel(database, { ...release, shipmentId });

    await expect(releaseOnBehalfLabel(database, { ...release, shipmentId })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      releaseOnBehalfLabel(database, { ...release, shipmentId: direct.shipmentId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await findOnBehalfLabelState(database, direct.shipmentId)).toBeNull();
  });

  it("starts the remessa only while the reseller's note is still the one it cites", async () => {
    const { shipmentId, tenantId } = await onBehalfScenario();
    await queueResellerSaleInvoices(database);
    await findResellerNote(shipmentId, tenantId);
    await queueOnBehalfInvoices(database);
    const [remessa] = await database
      .select({ id: shipmentInvoices.id })
      .from(shipmentInvoices)
      .where(
        and(
          eq(shipmentInvoices.shipmentId, shipmentId),
          eq(shipmentInvoices.kind, "on_behalf_shipment"),
        ),
      );
    const claim = { invoiceId: remessa?.id ?? "", shipmentId, now: new Date() };

    const stale = await claimOnBehalfRemessaDraft(database, { ...claim, citedAccessKey: SALE_KEY });
    const current = await claimOnBehalfRemessaDraft(database, {
      ...claim,
      citedAccessKey: RESELLER_KEY,
    });

    expect(stale).toBe(false);
    expect(current).toBe(true);
  });

  it("drops a queued Mercado Livre remessa whose note went back to typed, and opens it again later", async () => {
    const created = await createInvoiceScenario(database, {
      supplierFiscal: { ...TEST_SUPPLIER_FISCAL, invoiceModel: "on_behalf" },
      marketplace: "mercado_livre",
    });
    cleanups.push(created.cleanup);
    await queueResellerSaleInvoices(database);
    await findResellerNote(created.shipmentId, created.tenantId);
    const uploaded = { source: "uploaded" as const };
    const typed = { source: "typed" as const };
    const ofParcel = eq(shipmentResellerInvoices.shipmentId, created.shipmentId);
    await database.update(shipmentResellerInvoices).set(uploaded).where(ofParcel);
    await queueOnBehalfInvoices(database);
    const [remessa] = await database
      .select({ id: shipmentInvoices.id })
      .from(shipmentInvoices)
      .where(
        and(
          eq(shipmentInvoices.shipmentId, created.shipmentId),
          eq(shipmentInvoices.kind, "on_behalf_shipment"),
        ),
      );
    await database.update(shipmentResellerInvoices).set(typed).where(ofParcel);

    const claimed = await claimOnBehalfRemessaDraft(database, {
      invoiceId: remessa?.id ?? "",
      shipmentId: created.shipmentId,
      citedAccessKey: RESELLER_KEY,
      now: new Date(),
    });
    const afterClaim = await kindsOf(created.shipmentId);
    await database.update(shipmentResellerInvoices).set(uploaded).where(ofParcel);
    await queueOnBehalfInvoices(database);

    expect(claimed).toBe(false);
    expect(afterClaim).not.toContain("on_behalf_shipment");
    expect(await kindsOf(created.shipmentId)).toContain("on_behalf_shipment");
  });

  it("waits to open the remessa of a Mercado Livre order until its note is there", async () => {
    const created = await createInvoiceScenario(database, {
      supplierFiscal: { ...TEST_SUPPLIER_FISCAL, invoiceModel: "on_behalf" },
      marketplace: "mercado_livre",
    });
    cleanups.push(created.cleanup);
    await queueResellerSaleInvoices(database);
    await findResellerNote(created.shipmentId, created.tenantId);

    await queueOnBehalfInvoices(database);
    const whileTyped = await kindsOf(created.shipmentId);
    await database
      .update(shipmentResellerInvoices)
      .set({ source: "uploaded" })
      .where(eq(shipmentResellerInvoices.shipmentId, created.shipmentId));
    await queueOnBehalfInvoices(database);

    expect(whileTyped).not.toContain("on_behalf_shipment");
    expect(await kindsOf(created.shipmentId)).toContain("on_behalf_shipment");
  });

  it("finds no venda à ordem parcel on an order of direct notes", async () => {
    const direct = await createInvoiceScenario(database);
    cleanups.push(direct.cleanup);

    expect(
      await findOnBehalfLabelParcels(database, {
        tenantId: direct.tenantId,
        orderId: direct.orderId,
      }),
    ).toEqual([]);
  });
});
