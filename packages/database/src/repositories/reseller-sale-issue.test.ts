import { parseAccessKey } from "@sellbridge/shared/nfe-access-key";
import { defaultResellerBlingSettings } from "@sellbridge/shared/reseller-bling";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { resellerErpConnections, shipmentResellerInvoices } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import {
  createInvoiceScenario,
  TEST_SUPPLIER_FISCAL,
} from "../testing/shipment-invoice-fixtures.ts";
import { loadResellerSaleIssueWork } from "./reseller-sale-issue.ts";
import {
  claimDueResellerSaleInvoices,
  queueResellerSaleInvoices,
  recordErpResellerSaleInvoice,
  recordResellerSaleIssueProgress,
  retryResellerSaleIssue,
  stopResellerSaleIssue,
} from "./shipment-reseller-invoices.ts";

const database = createTestDatabase();
const cleanups: (() => Promise<void>)[] = [];
/** An NF-e of the fixture reseller (CNPJ 45.723.174/0001-10), number 79. */
const BLING_KEY = "31261145723174000110550010000000791000000791";

async function scenario(input: {
  marketplace: "mock" | "mercado_livre";
  issuingSince: Date | null;
}) {
  const created = await createInvoiceScenario(database, {
    supplierFiscal: { ...TEST_SUPPLIER_FISCAL, invoiceModel: "on_behalf" },
    marketplace: input.marketplace,
  });
  cleanups.push(created.cleanup);
  await database.insert(resellerErpConnections).values({
    tenantId: created.tenantId,
    provider: "bling",
    accessTokenEnc: "e2e-not-a-token",
    refreshTokenEnc: "e2e-not-a-token",
    expiresAt: new Date(Date.now() + 3_600_000),
    saleNotesEnabledAt: input.issuingSince,
    saleNoteSettings: { ...defaultResellerBlingSettings(), operationId: 77 },
  });
  await queueResellerSaleInvoices(database);
  const [note] = await database
    .select({ id: shipmentResellerInvoices.id })
    .from(shipmentResellerInvoices)
    .where(eq(shipmentResellerInvoices.shipmentId, created.shipmentId));
  if (note === undefined) {
    throw new Error("reseller note not queued");
  }
  return { ...created, invoiceId: note.id };
}

async function claimed(invoiceId: string) {
  const due = await claimDueResellerSaleInvoices(database, {
    now: new Date(),
    limit: 1000,
    leaseMilliseconds: 600_000,
  });
  return due.find((row) => row.id === invoiceId);
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe("claiming a note the reseller's ERP issues", () => {
  it("marks the note of a Mercado Livre order sold after issuing was turned on", async () => {
    const { invoiceId } = await scenario({
      marketplace: "mercado_livre",
      issuingSince: new Date(Date.now() - 3_600_000),
    });

    const due = await claimed(invoiceId);

    expect(due?.issuesFromErp).toBe(true);
    expect(due?.erpInvoiceId).toBeNull();
  });

  it("leaves to the reseller the note of a parcel created before issuing was on", async () => {
    const { invoiceId } = await scenario({
      marketplace: "mercado_livre",
      issuingSince: new Date(Date.now() + 3_600_000),
    });

    const due = await claimed(invoiceId);

    expect(due?.issuesFromErp).toBe(false);
  });

  it("leaves to the reseller the note of another channel", async () => {
    const { invoiceId } = await scenario({
      marketplace: "mock",
      issuingSince: new Date(Date.now() - 3_600_000),
    });

    const due = await claimed(invoiceId);

    expect(due?.issuesFromErp).toBe(false);
  });

  it("keeps on the Bling path a note its Bling started before issuing was turned off", async () => {
    const { invoiceId, tenantId } = await scenario({
      marketplace: "mercado_livre",
      issuingSince: new Date(Date.now() - 3_600_000),
    });
    await recordResellerSaleIssueProgress(database, invoiceId, { erpDraftRequestedAt: new Date() });
    await database
      .update(resellerErpConnections)
      .set({ saleNotesEnabledAt: null })
      .where(eq(resellerErpConnections.tenantId, tenantId));

    const due = await claimed(invoiceId);

    expect(due?.issuesFromErp).toBe(true);
  });
});

describe("stopping and retrying", () => {
  it("keeps a stopped note out of the job until the reseller retries", async () => {
    const { invoiceId, tenantId, shipmentId } = await scenario({
      marketplace: "mercado_livre",
      issuingSince: new Date(Date.now() - 3_600_000),
    });
    await stopResellerSaleIssue(database, {
      invoiceId,
      problem: 'Falta a forma de pagamento "Pix".',
      now: new Date(),
    });

    const whileStopped = await claimed(invoiceId);
    await retryResellerSaleIssue(database, { tenantId, shipmentId, now: new Date() });
    const afterRetry = await claimed(invoiceId);

    expect(whileStopped).toBeUndefined();
    expect(afterRetry?.issuesFromErp).toBe(true);
  });

  it("refuses to retry a note of another reseller", async () => {
    const { invoiceId, shipmentId } = await scenario({
      marketplace: "mercado_livre",
      issuingSince: new Date(Date.now() - 3_600_000),
    });
    await stopResellerSaleIssue(database, { invoiceId, problem: "Parada", now: new Date() });

    await expect(
      retryResellerSaleIssue(database, { tenantId: "another", shipmentId, now: new Date() }),
    ).rejects.toThrow("Esta nota não está parada");
  });
});

describe("the note issued by the reseller's ERP", () => {
  it("keeps its ids and, once issued, its key as from the ERP", async () => {
    const { invoiceId } = await scenario({
      marketplace: "mercado_livre",
      issuingSince: new Date(Date.now() - 3_600_000),
    });
    const parts = parseAccessKey(BLING_KEY);
    if (parts === null) {
      throw new Error("invalid test key");
    }

    await recordResellerSaleIssueProgress(database, invoiceId, { erpInvoiceId: 9001 });
    await recordErpResellerSaleInvoice(database, { invoiceId, parts, now: new Date() });

    const [row] = await database
      .select()
      .from(shipmentResellerInvoices)
      .where(eq(shipmentResellerInvoices.id, invoiceId));
    expect(row).toMatchObject({
      erpInvoiceId: 9001,
      accessKey: BLING_KEY,
      number: "79",
      source: "bling",
    });
  });

  it("loads the lines, the reseller's state and the saved settings", async () => {
    const { invoiceId, sku } = await scenario({
      marketplace: "mercado_livre",
      issuingSince: new Date(Date.now() - 3_600_000),
    });

    const work = await loadResellerSaleIssueWork(database, invoiceId);

    expect(work?.lines.map((line) => line.sku)).toEqual([sku]);
    expect(work?.resellerAddress?.state).toBe("MG");
    expect(work?.settings?.operationId).toBe(77);
    expect(work?.erpConnected).toBe(true);
    expect(work?.store.marketplace).toBe("mercado_livre");
  });
});
