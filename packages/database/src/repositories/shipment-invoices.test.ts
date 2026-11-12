import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  member,
  notificationDeliveries,
  orderShipments,
  shipmentInvoices,
} from "../schema/index.ts";
import { createTestDatabase, createTestUsers } from "../testing/fixtures.ts";
import { createInvoiceScenario } from "../testing/shipment-invoice-fixtures.ts";
import {
  findErpConnection,
  recordErpRefreshFailure,
  upsertErpConnection,
} from "./erp-connections.ts";
import {
  authorizedShipmentInvoices,
  claimDueShipmentInvoices,
  findShipmentInvoiceFiles,
  findSupplierShipmentInvoice,
  loadShipmentInvoiceWork,
  markShipmentInvoiceAttention,
  markShipmentInvoiceAuthorized,
  queueNewShipmentInvoices,
  retrySupplierShipmentInvoice,
  setErpInvoicing,
  whileHoldingShipmentInvoice,
} from "./shipment-invoices.ts";

const database = createTestDatabase();
const cleanups: (() => Promise<void>)[] = [];

async function scenario(options?: Parameters<typeof createInvoiceScenario>[1]) {
  const created = await createInvoiceScenario(database, options);
  cleanups.push(created.cleanup);
  return created;
}

async function invoiceOf(shipmentId: string) {
  const [row] = await database
    .select()
    .from(shipmentInvoices)
    .where(eq(shipmentInvoices.shipmentId, shipmentId));
  return row;
}

const TOKENS = {
  accessTokenEnc: "enc-access-2",
  refreshTokenEnc: "enc-refresh-2",
  expiresAt: new Date(Date.now() + 3_600_000),
};

/** Bling refuses the refresh token, then the supplier links the account again. */
async function expireAndReconnect(supplierId: string): Promise<void> {
  const connection = await findErpConnection(database, { supplierId, provider: "bling" });
  if (connection === null || connection.refreshTokenEnc === null) {
    throw new Error("connection not created");
  }
  await recordErpRefreshFailure(database, {
    connectionId: connection.id,
    refreshTokenEnc: connection.refreshTokenEnc,
    lastError: "refresh refused",
    expired: true,
  });
  await upsertErpConnection(database, {
    supplierId,
    provider: "bling",
    userId: null,
    tokens: TOKENS,
  });
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe("queueNewShipmentInvoices", () => {
  it("opens one invoice for a parcel of a supplier whose ERP issues notes", async () => {
    const { shipmentId } = await scenario();

    await queueNewShipmentInvoices(database);
    await queueNewShipmentInvoices(database);

    const rows = await database
      .select()
      .from(shipmentInvoices)
      .where(eq(shipmentInvoices.shipmentId, shipmentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("queued");
  });

  it("leaves out parcels of a supplier who did not turn emission on", async () => {
    const { shipmentId } = await scenario({ invoiceEnabledAt: null });

    await queueNewShipmentInvoices(database);

    expect(await invoiceOf(shipmentId)).toBeUndefined();
  });

  it("leaves out parcels created before emission was turned on", async () => {
    const { shipmentId } = await scenario({ invoiceEnabledAt: new Date(Date.now() + 60_000) });

    await queueNewShipmentInvoices(database);

    expect(await invoiceOf(shipmentId)).toBeUndefined();
  });

  it("leaves out parcels created while the ERP account was expired", async () => {
    const { shipmentId, supplierId } = await scenario();
    await expireAndReconnect(supplierId);

    await queueNewShipmentInvoices(database);

    expect(await invoiceOf(shipmentId)).toBeUndefined();
  });

  it("keeps queuing earlier parcels when a connected account is authorized again", async () => {
    const { shipmentId, supplierId } = await scenario();
    await upsertErpConnection(database, {
      supplierId,
      provider: "bling",
      userId: null,
      tokens: TOKENS,
    });

    await queueNewShipmentInvoices(database);

    expect((await invoiceOf(shipmentId))?.status).toBe("queued");
  });

  it("leaves out a cancelled parcel", async () => {
    const { shipmentId } = await scenario();
    await database
      .update(orderShipments)
      .set({ status: "cancelled" })
      .where(eq(orderShipments.id, shipmentId));

    await queueNewShipmentInvoices(database);

    expect(await invoiceOf(shipmentId)).toBeUndefined();
  });
});

describe("setErpInvoicing", () => {
  it("keeps the first date when emission is turned on twice", async () => {
    const first = new Date(Date.now() - 3_600_000);
    const { supplierId, shipmentId } = await scenario({ invoiceEnabledAt: first });

    await setErpInvoicing(database, { supplierId, enabled: true, now: new Date() });
    await queueNewShipmentInvoices(database);

    expect(await invoiceOf(shipmentId)).toBeDefined();
  });
});

describe("claimDueShipmentInvoices", () => {
  it("leases a due invoice so the next claim skips it", async () => {
    const { shipmentId } = await scenario();
    await queueNewShipmentInvoices(database);
    const invoice = await invoiceOf(shipmentId);
    const now = new Date();

    const first = await claimDueShipmentInvoices(database, {
      now,
      limit: 100,
      leaseMilliseconds: 600_000,
    });
    const second = await claimDueShipmentInvoices(database, {
      now,
      limit: 100,
      leaseMilliseconds: 600_000,
    });

    expect(first).toContain(invoice?.id);
    expect(second).not.toContain(invoice?.id);
  });
});

describe("whileHoldingShipmentInvoice", () => {
  it("does not run the work for a note another run stopped after it was claimed", async () => {
    const { shipmentId } = await scenario();
    await queueNewShipmentInvoices(database);
    const invoice = await invoiceOf(shipmentId);
    if (invoice === undefined) {
      throw new Error("invoice not queued");
    }
    await markShipmentInvoiceAttention(database, {
      invoiceId: invoice.id,
      problem: "Pedido cancelado",
    });
    let ran = false;

    const held = await whileHoldingShipmentInvoice(database, invoice.id, async () => {
      ran = true;
    });

    expect(held).toBe(false);
    expect(ran).toBe(false);
  });

  it("runs the work for a note still waiting for its next step", async () => {
    const { shipmentId } = await scenario();
    await queueNewShipmentInvoices(database);
    const invoice = await invoiceOf(shipmentId);
    if (invoice === undefined) {
      throw new Error("invoice not queued");
    }
    let ran = false;

    const held = await whileHoldingShipmentInvoice(database, invoice.id, async () => {
      ran = true;
    });

    expect(held).toBe(true);
    expect(ran).toBe(true);
  });
});

describe("loadShipmentInvoiceWork", () => {
  it("brings the parcel's lines with their prices and the product's fiscal data", async () => {
    const { shipmentId, sku } = await scenario();
    await queueNewShipmentInvoices(database);
    const invoice = await invoiceOf(shipmentId);

    const work = await loadShipmentInvoiceWork(database, invoice?.id ?? "");

    expect(work?.supplierFiscal?.address.state).toBe("MG");
    expect(work?.lines).toEqual([
      expect.objectContaining({
        sku,
        quantity: 2,
        unitPriceCents: 4990,
        unitCostCents: 2000,
        fiscal: expect.objectContaining({ ncm: "64029990", unit: "PAR" }),
      }),
    ]);
  });
});

describe("retrySupplierShipmentInvoice", () => {
  it("sends a stopped note back to the queue", async () => {
    const { supplierId, shipmentId } = await scenario();
    await queueNewShipmentInvoices(database);
    const invoice = await invoiceOf(shipmentId);
    await markShipmentInvoiceAttention(database, {
      invoiceId: invoice?.id ?? "",
      problem: "Falta o NCM",
    });

    await retrySupplierShipmentInvoice(database, { supplierId, shipmentId });

    const found = await findSupplierShipmentInvoice(database, { supplierId, shipmentId });
    expect(found).toMatchObject({ status: "queued", problem: null });
  });

  it("refuses a note that is not stopped", async () => {
    const { supplierId, shipmentId } = await scenario();
    await queueNewShipmentInvoices(database);

    const retry = retrySupplierShipmentInvoice(database, { supplierId, shipmentId });

    await expect(retry).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not show another supplier's note", async () => {
    const { shipmentId } = await scenario();
    const other = await scenario();
    await queueNewShipmentInvoices(database);

    const found = await findSupplierShipmentInvoice(database, {
      supplierId: other.supplierId,
      shipmentId,
    });

    expect(found).toBeNull();
  });
});

const AUTHORIZED_ACCESS_KEY = "31261111222333000181550010000012341000012345";

async function authorizedScenario() {
  const created = await scenario();
  await queueNewShipmentInvoices(database);
  const invoice = await invoiceOf(created.shipmentId);
  if (invoice === undefined) {
    throw new Error("invoice not queued");
  }
  return { ...created, invoiceId: invoice.id };
}

async function addMember(tenantId: string): Promise<string> {
  const users = await createTestUsers(database, 1);
  cleanups.push(users.cleanup);
  const [userId] = users.ids;
  if (userId === undefined) {
    throw new Error("user not created");
  }
  await database
    .insert(member)
    .values({ id: randomUUID(), organizationId: tenantId, userId, createdAt: new Date() });
  return userId;
}

function authorize(invoiceId: string) {
  return markShipmentInvoiceAuthorized(database, {
    invoiceId,
    number: "1234",
    series: "1",
    accessKey: AUTHORIZED_ACCESS_KEY,
    danfeUrl: null,
    authorizedAt: new Date(),
  });
}

describe("authorized notes for the reseller", () => {
  it("e-mails the reseller's people once, with the parcel's note to attach", async () => {
    const created = await authorizedScenario();
    const userId = await addMember(created.tenantId);

    await authorize(created.invoiceId);
    await authorize(created.invoiceId);

    const deliveries = await database
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.tenantId, created.tenantId));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      recipientId: userId,
      event: "invoice_authorized",
      channel: "email",
      content: { invoiceShipmentId: created.shipmentId },
    });
  });

  it("lists a parcel's note only once SEFAZ authorized it", async () => {
    const created = await authorizedScenario();

    const before = await authorizedShipmentInvoices(database, [created.shipmentId]);
    await authorize(created.invoiceId);
    const after = await authorizedShipmentInvoices(database, [created.shipmentId]);

    expect(before.size).toBe(0);
    expect(after.get(created.shipmentId)).toMatchObject({
      number: "1234",
      accessKey: AUTHORIZED_ACCESS_KEY,
    });
  });

  it("gives the note's files with who may download them, only when authorized", async () => {
    const created = await authorizedScenario();

    const before = await findShipmentInvoiceFiles(database, created.shipmentId);
    await authorize(created.invoiceId);
    const after = await findShipmentInvoiceFiles(database, created.shipmentId);

    expect(before).toBeNull();
    expect(after).toEqual({
      shipmentId: created.shipmentId,
      orderId: created.orderId,
      tenantId: created.tenantId,
      supplierId: created.supplierId,
      number: "1234",
      accessKey: AUTHORIZED_ACCESS_KEY,
    });
  });
});
