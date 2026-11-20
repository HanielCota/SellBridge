import { randomUUID } from "node:crypto";
import { parseAccessKey, type AccessKeyParts } from "@sellbridge/shared/nfe-access-key";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { orders, shipmentResellerInvoices, tenantProfile } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import {
  createInvoiceScenario,
  TEST_SUPPLIER_FISCAL,
} from "../testing/shipment-invoice-fixtures.ts";
import {
  claimDueResellerSaleInvoices,
  queueResellerSaleInvoices,
  recordMarketplaceResellerSaleInvoice,
  resellerSaleInvoicesOf,
  saveTypedResellerSaleInvoice,
  saveUploadedResellerSaleInvoice,
  scheduleResellerSaleInvoiceCheck,
} from "./shipment-reseller-invoices.ts";

const database = createTestDatabase();
const cleanups: (() => Promise<void>)[] = [];

/** NF-e keys of the fixture reseller (CNPJ 45.723.174/0001-10): numbers 77 and 78. */
const TYPED_KEY = "35261145723174000110550010000000771000000770";
const MARKETPLACE_KEY = "35261145723174000110550010000000781000000785";

function keyParts(key: string): AccessKeyParts {
  const parts = parseAccessKey(key);
  if (parts === null) {
    throw new Error(`invalid test key ${key}`);
  }
  return parts;
}

async function scenario(invoiceModel: "direct" | "on_behalf" = "on_behalf") {
  const created = await createInvoiceScenario(database, {
    supplierFiscal: { ...TEST_SUPPLIER_FISCAL, invoiceModel },
  });
  cleanups.push(created.cleanup);
  return created;
}

async function noteOf(shipmentId: string) {
  const [row] = await database
    .select()
    .from(shipmentResellerInvoices)
    .where(eq(shipmentResellerInvoices.shipmentId, shipmentId));
  return row;
}

async function claimAll() {
  return claimDueResellerSaleInvoices(database, {
    now: new Date(),
    limit: 1000,
    leaseMilliseconds: 600_000,
  });
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe("queueResellerSaleInvoices", () => {
  it("opens the note of a venda à ordem parcel sold by a company", async () => {
    const { shipmentId, tenantId } = await scenario();

    await queueResellerSaleInvoices(database);

    expect(await noteOf(shipmentId)).toMatchObject({ tenantId, accessKey: null, checks: 0 });
  });

  it("opens none when the supplier invoices the buyer directly", async () => {
    const { shipmentId } = await scenario("direct");

    await queueResellerSaleInvoices(database);

    expect(await noteOf(shipmentId)).toBeUndefined();
  });

  it("opens none for a reseller selling with a CPF", async () => {
    const { shipmentId, tenantId } = await scenario();
    await database
      .update(tenantProfile)
      .set({ cnpj: null, companyName: null })
      .where(eq(tenantProfile.tenantId, tenantId));

    await queueResellerSaleInvoices(database);

    expect(await noteOf(shipmentId)).toBeUndefined();
  });

  it("opens each note once", async () => {
    const { shipmentId } = await scenario();

    await queueResellerSaleInvoices(database);
    await queueResellerSaleInvoices(database);

    const rows = await database
      .select({ id: shipmentResellerInvoices.id })
      .from(shipmentResellerInvoices)
      .where(eq(shipmentResellerInvoices.shipmentId, shipmentId));
    expect(rows).toHaveLength(1);
  });
});

describe("claimDueResellerSaleInvoices", () => {
  it("hands over the order and the reseller's CNPJ, then leases the note", async () => {
    const { shipmentId, externalOrderId } = await scenario();
    await queueResellerSaleInvoices(database);

    const claimed = await claimAll();
    const again = await claimAll();

    const note = await noteOf(shipmentId);
    expect(claimed.find((due) => due.id === note?.id)).toMatchObject({
      externalOrderId,
      resellerCnpj: "45723174000110",
      checks: 0,
    });
    expect(again.some((due) => due.id === note?.id)).toBe(false);
  });

  it("skips the note of a cancelled order", async () => {
    const { shipmentId, orderId } = await scenario();
    await queueResellerSaleInvoices(database);
    await database.update(orders).set({ status: "cancelled" }).where(eq(orders.id, orderId));

    const claimed = await claimAll();

    const note = await noteOf(shipmentId);
    expect(claimed.some((due) => due.id === note?.id)).toBe(false);
  });
});

describe("saveTypedResellerSaleInvoice", () => {
  it("keeps the typed key with its number and series", async () => {
    const { shipmentId, tenantId } = await scenario();
    await queueResellerSaleInvoices(database);
    const now = new Date("2026-11-19T12:00:00Z");

    await saveTypedResellerSaleInvoice(database, {
      tenantId,
      shipmentId,
      parts: keyParts(TYPED_KEY),
      now,
    });

    expect(await noteOf(shipmentId)).toMatchObject({
      accessKey: TYPED_KEY,
      number: "77",
      series: "1",
      source: "typed",
      foundAt: now,
      problem: null,
    });
  });

  it("refuses a second key once the note is saved", async () => {
    const { shipmentId, tenantId } = await scenario();
    await queueResellerSaleInvoices(database);
    const typed = { tenantId, shipmentId, parts: keyParts(TYPED_KEY), now: new Date() };
    await saveTypedResellerSaleInvoice(database, typed);

    await expect(
      saveTypedResellerSaleInvoice(database, { ...typed, parts: keyParts(MARKETPLACE_KEY) }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a parcel of another reseller", async () => {
    const { shipmentId } = await scenario();
    await queueResellerSaleInvoices(database);

    await expect(
      saveTypedResellerSaleInvoice(database, {
        tenantId: randomUUID(),
        shipmentId,
        parts: keyParts(TYPED_KEY),
        now: new Date(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("saveUploadedResellerSaleInvoice", () => {
  it("keeps the note whose XML the reseller sent", async () => {
    const { shipmentId, tenantId } = await scenario();
    await queueResellerSaleInvoices(database);

    await saveUploadedResellerSaleInvoice(database, {
      tenantId,
      shipmentId,
      parts: keyParts(TYPED_KEY),
      now: new Date(),
    });

    expect(await noteOf(shipmentId)).toMatchObject({ accessKey: TYPED_KEY, source: "uploaded" });
  });

  it("takes the XML of the note the reseller typed before", async () => {
    const { shipmentId, tenantId } = await scenario();
    await queueResellerSaleInvoices(database);
    const note = { tenantId, shipmentId, parts: keyParts(TYPED_KEY), now: new Date() };
    await saveTypedResellerSaleInvoice(database, note);

    await saveUploadedResellerSaleInvoice(database, note);

    expect((await noteOf(shipmentId))?.source).toBe("uploaded");
  });

  it("refuses the XML of another note than the one already saved", async () => {
    const { shipmentId, tenantId } = await scenario();
    await queueResellerSaleInvoices(database);
    const note = { tenantId, shipmentId, parts: keyParts(TYPED_KEY), now: new Date() };
    await saveTypedResellerSaleInvoice(database, note);

    await expect(
      saveUploadedResellerSaleInvoice(database, { ...note, parts: keyParts(MARKETPLACE_KEY) }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a parcel of another reseller", async () => {
    const { shipmentId } = await scenario();
    await queueResellerSaleInvoices(database);

    await expect(
      saveUploadedResellerSaleInvoice(database, {
        tenantId: randomUUID(),
        shipmentId,
        parts: keyParts(TYPED_KEY),
        now: new Date(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("marketplace reads", () => {
  it("saves the note read on the marketplace with its issue date", async () => {
    const { shipmentId } = await scenario();
    await queueResellerSaleInvoices(database);
    const note = await noteOf(shipmentId);
    const issuedAt = new Date("2026-11-19T10:00:00Z");

    await recordMarketplaceResellerSaleInvoice(database, {
      invoiceId: note?.id ?? "",
      parts: keyParts(MARKETPLACE_KEY),
      issuedAt,
      now: new Date(),
    });

    expect(await noteOf(shipmentId)).toMatchObject({
      accessKey: MARKETPLACE_KEY,
      number: "78",
      source: "marketplace",
      issuedAt,
    });
  });

  it("never replaces a key the reseller already typed", async () => {
    const { shipmentId, tenantId } = await scenario();
    await queueResellerSaleInvoices(database);
    const note = await noteOf(shipmentId);
    await saveTypedResellerSaleInvoice(database, {
      tenantId,
      shipmentId,
      parts: keyParts(TYPED_KEY),
      now: new Date(),
    });

    await recordMarketplaceResellerSaleInvoice(database, {
      invoiceId: note?.id ?? "",
      parts: keyParts(MARKETPLACE_KEY),
      issuedAt: null,
      now: new Date(),
    });
    await scheduleResellerSaleInvoiceCheck(database, {
      invoiceId: note?.id ?? "",
      checks: 9,
      nextCheckAt: new Date(),
      problem: "outra nota",
    });

    expect(await noteOf(shipmentId)).toMatchObject({
      accessKey: TYPED_KEY,
      source: "typed",
      checks: 0,
      problem: null,
    });
  });

  it("keeps the reason the marketplace's note does not serve until the next read", async () => {
    const { shipmentId, tenantId } = await scenario();
    await queueResellerSaleInvoices(database);
    const note = await noteOf(shipmentId);
    const nextCheckAt = new Date("2026-11-19T12:05:00Z");

    await scheduleResellerSaleInvoiceCheck(database, {
      invoiceId: note?.id ?? "",
      checks: 1,
      nextCheckAt,
      problem: "A nota foi emitida por outro CNPJ.",
    });

    expect(
      (await resellerSaleInvoicesOf(database, tenantId, [shipmentId])).get(shipmentId),
    ).toEqual({
      accessKey: null,
      number: null,
      series: null,
      source: null,
      foundAt: null,
      problem: "A nota foi emitida por outro CNPJ.",
    });
    expect(await noteOf(shipmentId)).toMatchObject({ checks: 1, nextCheckAt });
  });

  it("shows a reseller only its own parcels' notes", async () => {
    const { shipmentId } = await scenario();
    await queueResellerSaleInvoices(database);

    expect((await resellerSaleInvoicesOf(database, randomUUID(), [shipmentId])).size).toBe(0);
  });
});
