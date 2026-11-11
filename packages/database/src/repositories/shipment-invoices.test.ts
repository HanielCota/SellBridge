import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { orderShipments, shipmentInvoices } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { createInvoiceScenario } from "../testing/shipment-invoice-fixtures.ts";
import {
  findErpConnection,
  recordErpRefreshFailure,
  upsertErpConnection,
} from "./erp-connections.ts";
import {
  claimDueShipmentInvoices,
  findSupplierShipmentInvoice,
  loadShipmentInvoiceWork,
  markShipmentInvoiceAttention,
  queueNewShipmentInvoices,
  retrySupplierShipmentInvoice,
  setErpInvoicing,
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
