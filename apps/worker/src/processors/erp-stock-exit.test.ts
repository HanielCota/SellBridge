import { schema } from "@sellbridge/database";
import { createInvoiceScenario } from "@sellbridge/database/testing/shipment-invoice";
import { createBlingRateLimiter } from "@sellbridge/marketplaces/bling";
import { logger } from "@sellbridge/shared/logger";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerTestEnvironment } from "../testing/fixtures.ts";
import type { ErpBlingDependencies } from "./erp-bling-client.ts";
import { postDueErpStockExits } from "./erp-stock-exit.ts";

const { database, cipher } = createWorkerTestEnvironment();
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

afterAll(async () => {
  await database.$client.end();
});

interface FakeBling {
  /** Status answered to `POST /estoques`, one per call; 201 once the list runs out. */
  exitStatuses: number[];
  deposits: { id: number; situacao: number; padrao: boolean }[];
  /** Answers every call with 401 (the access is no longer accepted). */
  refuseAccess?: boolean;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function exitAnswer(state: FakeBling): Response {
  const status = state.exitStatuses.shift() ?? 201;
  if (status === 201) {
    return json(201, { data: { id: 9001 } });
  }
  return json(status, { error: { type: "X", message: "falhou", description: "Produto inválido" } });
}

function fakeBling(state: FakeBling) {
  const exits: unknown[] = [];
  const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    if (url.pathname.endsWith("/oauth/token")) {
      return json(400, { error: { type: "invalid_grant", message: "recusado" } });
    }
    if (state.refuseAccess === true) {
      return json(401, { error: { type: "invalid_token", message: "token" } });
    }
    if (url.pathname.endsWith("/depositos")) {
      return json(200, {
        data: state.deposits.map((deposit) => ({
          ...deposit,
          descricao: "Depósito",
          desconsiderarSaldo: false,
        })),
      });
    }
    if (url.pathname.endsWith("/estoques") && init?.method === "POST") {
      exits.push(typeof init.body === "string" ? JSON.parse(init.body) : null);
      return exitAnswer(state);
    }
    throw new Error(`unexpected Bling call ${url.pathname}`);
  });
  return { fetchImplementation, exits };
}

function dependenciesFor(fetchImplementation: typeof fetch): ErpBlingDependencies {
  return {
    database,
    cipher,
    blingCredentials: { clientId: "id", clientSecret: "secret" },
    limiter: createBlingRateLimiter({ sleep: async () => {} }),
    fetchImplementation,
  };
}

/** A sale shipped just now by a supplier without the NF-e through SellBridge. */
async function shippedSale() {
  const scenario = await createInvoiceScenario(database, { invoiceEnabledAt: null });
  cleanups.push(scenario.cleanup);
  await database
    .update(schema.supplierErpConnections)
    .set({
      accessTokenEnc: cipher.encrypt("access"),
      refreshTokenEnc: cipher.encrypt("refresh"),
      stockExitsSince: new Date(Date.now() - 60_000),
      stockCheckedAt: new Date(),
    })
    .where(eq(schema.supplierErpConnections.supplierId, scenario.supplierId));
  await database
    .update(schema.supplierProducts)
    .set({ erpProductId: 777 })
    .where(eq(schema.supplierProducts.id, scenario.productId));
  await database
    .update(schema.orderItems)
    .set({ stockState: "consumed" })
    .where(eq(schema.orderItems.id, scenario.orderItemId));
  await database.insert(schema.orderStatusChanges).values({
    tenantId: scenario.tenantId,
    orderId: scenario.orderId,
    status: "shipped",
  });
  return scenario;
}

async function exitRow(orderItemId: string) {
  const [row] = await database
    .select({ status: schema.erpStockExits.status, problem: schema.erpStockExits.problem })
    .from(schema.erpStockExits)
    .where(eq(schema.erpStockExits.orderItemId, orderItemId));
  return row;
}

function loggedEvents(spy: { mock: { calls: unknown[][] } }): unknown[] {
  return spy.mock.calls.map((call) => call[0]);
}

const ONE_DEFAULT_DEPOSIT = [{ id: 14, situacao: 1, padrao: true }];

describe("postDueErpStockExits", () => {
  it("posts the sale's exit to Bling once, never again on the next runs", async () => {
    const sale = await shippedSale();
    const bling = fakeBling({ exitStatuses: [], deposits: ONE_DEFAULT_DEPOSIT });
    const dependencies = dependenciesFor(bling.fetchImplementation);

    await postDueErpStockExits(dependencies);
    await postDueErpStockExits(dependencies);

    expect(bling.exits).toEqual([
      {
        produto: { id: 777 },
        deposito: { id: 14 },
        operacao: "S",
        quantidade: 2,
        observacoes: `SellBridge: venda do pedido ${sale.externalOrderId}`,
      },
    ]);
    expect((await exitRow(sale.orderItemId))?.status).toBe("posted");
  });

  it("posts nothing for a parcel whose NF-e went through SellBridge", async () => {
    const sale = await shippedSale();
    await database.insert(schema.shipmentInvoices).values({
      shipmentId: sale.shipmentId,
      supplierId: sale.supplierId,
      provider: "bling",
    });
    const bling = fakeBling({ exitStatuses: [], deposits: ONE_DEFAULT_DEPOSIT });

    await postDueErpStockExits(dependenciesFor(bling.fetchImplementation));

    expect(bling.exits).toEqual([]);
  });

  it("never resends an exit whose answer failed, and tells the team what to check", async () => {
    const sale = await shippedSale();
    const bling = fakeBling({ exitStatuses: [500, 201], deposits: ONE_DEFAULT_DEPOSIT });
    const dependencies = dependenciesFor(bling.fetchImplementation);
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    await postDueErpStockExits(dependencies);
    await postDueErpStockExits(dependencies);

    expect(bling.exits).toHaveLength(1);
    const row = await exitRow(sale.orderItemId);
    expect(row?.status).toBe("uncertain");
    expect(row?.problem).toContain(
      `produto ${sale.sku}, pedido ${sale.externalOrderId}, 2 unidades`,
    );
    expect(loggedEvents(error)).toContain("erp.stock_exit_uncertain");
  });

  it("keeps an exit Bling refused for the team, without sending it again", async () => {
    const sale = await shippedSale();
    const bling = fakeBling({ exitStatuses: [400, 201], deposits: ONE_DEFAULT_DEPOSIT });
    const dependencies = dependenciesFor(bling.fetchImplementation);
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    await postDueErpStockExits(dependencies);
    await postDueErpStockExits(dependencies);

    expect(bling.exits).toHaveLength(1);
    expect((await exitRow(sale.orderItemId))?.status).toBe("failed");
    expect(loggedEvents(error)).toContain("erp.stock_exit_refused");
  });

  it("tries again on the next run when Bling's rate limit answered", async () => {
    const sale = await shippedSale();
    const bling = fakeBling({
      exitStatuses: [429, 429, 429, 429, 429, 201],
      deposits: ONE_DEFAULT_DEPOSIT,
    });
    const dependencies = dependenciesFor(bling.fetchImplementation);
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    const first = await postDueErpStockExits(dependencies);
    const second = await postDueErpStockExits(dependencies);

    expect(first.retryLater).toBe(1);
    expect(second.posted).toBe(1);
    expect((await exitRow(sale.orderItemId))?.status).toBe("posted");
  });

  it("leaves the supplier's other exits for the next run once the rate limit answered", async () => {
    const sale = await shippedSale();
    const [other] = await database
      .insert(schema.orderItems)
      .values({
        tenantId: sale.tenantId,
        orderId: sale.orderId,
        supplierProductId: sale.productId,
        title: "Chinelo",
        quantity: 1,
        unitPriceCents: 4990,
        unitCostCents: 2000,
        stockState: "consumed",
      })
      .returning({ id: schema.orderItems.id });
    if (other === undefined) throw new Error("second item not created");
    const bling = fakeBling({
      exitStatuses: [429, 429, 429, 429, 429],
      deposits: ONE_DEFAULT_DEPOSIT,
    });
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    const summary = await postDueErpStockExits(dependenciesFor(bling.fetchImplementation));

    expect(summary).toEqual({ posted: 0, forTeam: 0, retryLater: 1 });
    expect(await exitRow(sale.orderItemId)).toBeUndefined();
    expect(await exitRow(other.id)).toBeUndefined();
    expect(new Set(bling.exits.map((exit) => JSON.stringify(exit))).size).toBe(1);
  });

  it("waits for the reconnection when Bling refuses the access, leaving the exit due", async () => {
    const sale = await shippedSale();
    const bling = fakeBling({
      exitStatuses: [],
      deposits: ONE_DEFAULT_DEPOSIT,
      refuseAccess: true,
    });
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    await postDueErpStockExits(dependenciesFor(bling.fetchImplementation));

    expect(bling.exits).toEqual([]);
    expect(await exitRow(sale.orderItemId)).toBeUndefined();
  });

  it("posts nothing and tells the team when Bling has no default warehouse", async () => {
    const sale = await shippedSale();
    const bling = fakeBling({
      exitStatuses: [],
      deposits: [
        { id: 1, situacao: 1, padrao: false },
        { id: 2, situacao: 1, padrao: false },
      ],
    });
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    await postDueErpStockExits(dependenciesFor(bling.fetchImplementation));

    expect(bling.exits).toEqual([]);
    expect(await exitRow(sale.orderItemId)).toBeUndefined();
    expect(loggedEvents(error)).toContain("erp.stock_exit_no_deposit");
  });

  it("tells the team about a reservation a stopped worker left half done", async () => {
    const sale = await shippedSale();
    await database.insert(schema.erpStockExits).values({
      orderItemId: sale.orderItemId,
      supplierId: sale.supplierId,
      supplierProductId: sale.productId,
      erpProductId: 777,
      quantity: 2,
      sku: sale.sku,
      externalOrderId: sale.externalOrderId,
      status: "posting",
      createdAt: new Date(Date.now() - 11 * 60_000),
    });
    const bling = fakeBling({ exitStatuses: [], deposits: ONE_DEFAULT_DEPOSIT });
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    await postDueErpStockExits(dependenciesFor(bling.fetchImplementation));

    expect(bling.exits).toEqual([]);
    expect((await exitRow(sale.orderItemId))?.status).toBe("uncertain");
    expect(loggedEvents(error)).toContain("erp.stock_exit_uncertain");
  });
});
