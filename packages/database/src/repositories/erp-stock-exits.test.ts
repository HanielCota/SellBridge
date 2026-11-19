import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  erpStockExits,
  orderItems,
  orderStatusChanges,
  shipmentInvoices,
  supplierErpConnections,
  supplierProducts,
} from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { createInvoiceScenario } from "../testing/shipment-invoice-fixtures.ts";
import {
  listErpStockExitsDue,
  markErpStockExitForTeam,
  markErpStockExitPosted,
  releaseErpStockExit,
  reserveErpStockExit,
  takeStalledErpStockExits,
} from "./erp-stock-exits.ts";

const database = createTestDatabase();
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

/** A supplier without the NF-e through SellBridge whose sold item was shipped just now. */
async function shippedSale(options: { linked?: boolean; consumed?: boolean } = {}) {
  const scenario = await createInvoiceScenario(database, { invoiceEnabledAt: null });
  cleanups.push(scenario.cleanup);
  await database
    .update(supplierErpConnections)
    .set({ stockExitsSince: new Date(Date.now() - 60_000), stockCheckedAt: new Date() })
    .where(eq(supplierErpConnections.supplierId, scenario.supplierId));
  if (options.linked ?? true) {
    await database
      .update(supplierProducts)
      .set({ erpProductId: 777 })
      .where(eq(supplierProducts.id, scenario.productId));
  }
  if (options.consumed ?? true) {
    await database
      .update(orderItems)
      .set({ stockState: "consumed" })
      .where(eq(orderItems.id, scenario.orderItemId));
  }
  await database.insert(orderStatusChanges).values({
    tenantId: scenario.tenantId,
    orderId: scenario.orderId,
    status: "shipped",
  });
  return scenario;
}

async function dueFor(orderItemId: string) {
  const due = await listErpStockExitsDue(database, 1000);
  return due.find((exit) => exit.orderItemId === orderItemId);
}

describe("listErpStockExitsDue", () => {
  it("lists a shipped item linked to Bling whose NF-e did not go through SellBridge", async () => {
    const sale = await shippedSale();

    const due = await dueFor(sale.orderItemId);

    expect(due).toEqual({
      orderItemId: sale.orderItemId,
      supplierId: sale.supplierId,
      supplierProductId: sale.productId,
      erpProductId: 777,
      sku: sale.sku,
      title: "Chinelo",
      quantity: 2,
      externalOrderId: sale.externalOrderId,
    });
  });

  it("leaves out a parcel with an NF-e through SellBridge, whose sale order lowers Bling", async () => {
    const sale = await shippedSale();
    await database.insert(shipmentInvoices).values({
      shipmentId: sale.shipmentId,
      supplierId: sale.supplierId,
      provider: "bling",
    });

    expect(await dueFor(sale.orderItemId)).toBeUndefined();
  });

  it("leaves out sales shipped before the account started posting exits", async () => {
    const sale = await shippedSale();
    await database
      .update(supplierErpConnections)
      .set({ stockExitsSince: new Date(Date.now() + 60_000) })
      .where(eq(supplierErpConnections.supplierId, sale.supplierId));

    expect(await dueFor(sale.orderItemId)).toBeUndefined();
  });

  it("waits after a reconnection until a full check relinked the products", async () => {
    const sale = await shippedSale();
    await database
      .update(supplierErpConnections)
      .set({ connectedAt: new Date(Date.now() + 1_000) })
      .where(eq(supplierErpConnections.supplierId, sale.supplierId));

    expect(await dueFor(sale.orderItemId)).toBeUndefined();
  });

  it("leaves out products not linked to Bling and items not shipped yet", async () => {
    const unlinked = await shippedSale({ linked: false });
    const notShipped = await shippedSale({ consumed: false });

    expect(await dueFor(unlinked.orderItemId)).toBeUndefined();
    expect(await dueFor(notShipped.orderItemId)).toBeUndefined();
  });
});

describe("never posting the same exit twice", () => {
  it("reserves an item once; a second reservation gets nothing", async () => {
    const sale = await shippedSale();
    const due = await dueFor(sale.orderItemId);
    if (due === undefined) throw new Error("exit not due");

    const first = await reserveErpStockExit(database, due);
    const second = await reserveErpStockExit(database, due);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await dueFor(sale.orderItemId)).toBeUndefined();
  });

  it("keeps a posted or uncertain exit out of the next sweeps", async () => {
    const posted = await shippedSale();
    const uncertain = await shippedSale();
    for (const sale of [posted, uncertain]) {
      const due = await dueFor(sale.orderItemId);
      if (due === undefined) throw new Error("exit not due");
      const exitId = await reserveErpStockExit(database, due);
      if (exitId === null) throw new Error("not reserved");
      if (sale === posted) {
        await markErpStockExitPosted(database, { exitId, erpStockId: 5 });
        continue;
      }
      await markErpStockExitForTeam(database, { exitId, status: "uncertain", problem: "x" });
    }

    expect(await dueFor(posted.orderItemId)).toBeUndefined();
    expect(await dueFor(uncertain.orderItemId)).toBeUndefined();
  });

  it("lists the item again once a reservation Bling never received is released", async () => {
    const sale = await shippedSale();
    const due = await dueFor(sale.orderItemId);
    if (due === undefined) throw new Error("exit not due");
    const exitId = await reserveErpStockExit(database, due);
    if (exitId === null) throw new Error("not reserved");

    await releaseErpStockExit(database, exitId);

    expect(await dueFor(sale.orderItemId)).toBeDefined();
  });

  it("turns a reservation left half done by a stopped worker into one the team checks", async () => {
    const sale = await shippedSale();
    const due = await dueFor(sale.orderItemId);
    if (due === undefined) throw new Error("exit not due");
    const exitId = await reserveErpStockExit(database, due);
    if (exitId === null) throw new Error("not reserved");
    await database
      .update(erpStockExits)
      .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(erpStockExits.id, exitId));

    const stalled = await takeStalledErpStockExits(database, "parou no meio");

    expect(stalled).toContainEqual({
      exitId,
      supplierId: sale.supplierId,
      sku: sale.sku,
      externalOrderId: sale.externalOrderId,
      quantity: 2,
    });
    expect(await takeStalledErpStockExits(database, "parou no meio")).not.toContainEqual(
      expect.objectContaining({ exitId }),
    );
  });
});
