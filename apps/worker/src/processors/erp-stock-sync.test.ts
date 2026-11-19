import { schema } from "@sellbridge/database";
import { recordErpStockNotice } from "@sellbridge/database/repositories";
import { createBlingRateLimiter } from "@sellbridge/marketplaces/bling";
import { logger } from "@sellbridge/shared/logger";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerTestEnvironment } from "../testing/fixtures.ts";
import {
  checkAllErpStock,
  checkSupplierErpStock,
  refreshSupplierErpStock,
  type ErpStockSyncDependencies,
} from "./erp-stock-sync.ts";

const { database, cipher } = createWorkerTestEnvironment();
const credentials = { clientId: "id", clientSecret: "secret" };
const createdSuppliers: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const id of createdSuppliers.splice(0)) {
    await database.delete(schema.suppliers).where(eq(schema.suppliers.id, id));
  }
});

afterAll(async () => {
  await database.$client.end();
});

interface FakeBlingState {
  companyId: string;
  /** Bling products by code, with their virtual balance. */
  products: { id: number; codigo: string; balance: number }[];
  /** Answers every call with this status (401 = the token is no longer accepted). */
  failWith?: number;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === "string") {
    return new URL(input);
  }
  return input instanceof URL ? input : new URL(input.url);
}

function matchesFilter(balance: number, filter: number): boolean {
  if (filter === 0) {
    return balance === 0;
  }
  return filter === 1 ? balance > 0 : balance < 0;
}

function stockAnswer(state: FakeBlingState, url: URL): Response {
  const ids = new Set(url.searchParams.getAll("idsProdutos[]").map(Number));
  const filter = Number(url.searchParams.get("filtroSaldoEstoque") ?? "1");
  const data = state.products
    .filter((product) => ids.has(product.id) && matchesFilter(product.balance, filter))
    .map((product) => ({
      produto: { id: product.id, codigo: product.codigo },
      saldoFisicoTotal: product.balance,
      saldoVirtualTotal: product.balance,
    }));
  return json(200, { data });
}

function productsAnswer(state: FakeBlingState, url: URL): Response {
  const codes = new Set(url.searchParams.getAll("codigos[]"));
  const data = state.products
    .filter((product) => codes.has(product.codigo))
    .map((product) => ({
      id: product.id,
      codigo: product.codigo,
      nome: product.codigo,
      formato: "S",
      situacao: "A",
    }));
  return json(200, { data });
}

/** A stand-in for Bling's API: company, product lookup by code and stock balances. */
function fakeBling(state: FakeBlingState) {
  const paths: string[] = [];
  const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
    const url = requestUrl(input);
    paths.push(url.pathname);
    if (state.failWith !== undefined) {
      return json(state.failWith, { error: { type: "X", message: "falhou" } });
    }
    if (url.pathname.endsWith("/empresas/me/dados-basicos")) {
      return json(200, { data: { id: state.companyId } });
    }
    if (url.pathname.endsWith("/estoques/saldos")) {
      return stockAnswer(state, url);
    }
    if (url.pathname.endsWith("/produtos")) {
      return productsAnswer(state, url);
    }
    if (url.pathname.endsWith("/oauth/token")) {
      return json(400, { error: { type: "invalid_grant", message: "refresh recusado" } });
    }
    throw new Error(`unexpected Bling call ${url.pathname}`);
  });
  return { fetchImplementation, paths };
}

function dependenciesFor(fetchImplementation: typeof fetch) {
  const requestListingSync = vi.fn<() => Promise<void>>(async () => {});
  const enqueueSupplierCheck = vi.fn<(supplierId: string) => Promise<void>>(async () => {});
  const dependencies: ErpStockSyncDependencies = {
    database,
    cipher,
    blingCredentials: credentials,
    limiter: createBlingRateLimiter({ sleep: async () => {} }),
    fetchImplementation,
    requestListingSync,
    enqueueSupplierCheck,
  };
  return { dependencies, requestListingSync, enqueueSupplierCheck };
}

async function createSupplier(options: {
  invoiceEnabled?: boolean;
  companyId?: string | null;
  stockCheckedAt?: Date | null;
  lastStockNoticeAt?: Date | null;
}) {
  const [supplier] = await database
    .insert(schema.suppliers)
    .values({ name: "Fornecedor estoque", niche: "Teste", state: "ZZ", city: "Teste" })
    .returning({ id: schema.suppliers.id });
  if (supplier === undefined) {
    throw new Error("supplier not created");
  }
  createdSuppliers.push(supplier.id);
  await database.insert(schema.supplierErpConnections).values({
    supplierId: supplier.id,
    provider: "bling",
    accessTokenEnc: cipher.encrypt("access"),
    refreshTokenEnc: cipher.encrypt("refresh"),
    expiresAt: new Date(Date.now() + 6 * 3600_000),
    invoiceEnabledAt: (options.invoiceEnabled ?? true) ? new Date() : null,
    erpCompanyId: options.companyId ?? null,
    stockCheckedAt: options.stockCheckedAt ?? null,
    lastStockNoticeAt: options.lastStockNoticeAt ?? null,
  });
  return supplier.id;
}

async function createProduct(
  supplierId: string,
  input: { sku: string; stock: number; erpProductId?: number; reservedStock?: number },
) {
  const [product] = await database
    .insert(schema.supplierProducts)
    .values({
      supplierId,
      sku: input.sku,
      title: `Produto ${input.sku}`,
      costCents: 1000,
      suggestedPriceCents: 2000,
      stock: input.stock,
      reservedStock: input.reservedStock ?? 0,
      erpProductId: input.erpProductId ?? null,
    })
    .returning({ id: schema.supplierProducts.id });
  if (product === undefined) {
    throw new Error("product not created");
  }
  return product.id;
}

async function productOf(productId: string) {
  const [row] = await database
    .select({
      stock: schema.supplierProducts.stock,
      title: schema.supplierProducts.title,
      erpProductId: schema.supplierProducts.erpProductId,
    })
    .from(schema.supplierProducts)
    .where(eq(schema.supplierProducts.id, productId));
  return row;
}

function loggedEvents(spy: { mock: { calls: unknown[][] } }): unknown[] {
  return spy.mock.calls.map((call) => call[0]);
}

describe("checkSupplierErpStock", () => {
  it("links products by SKU and catches a stock change no notice brought", async () => {
    const supplierId = await createSupplier({});
    const productId = await createProduct(supplierId, { sku: "TENIS-38", stock: 10 });
    const planilhaOnly = await createProduct(supplierId, { sku: "SO-PLANILHA", stock: 4 });
    const bling = fakeBling({
      companyId: "company-a",
      products: [{ id: 501, codigo: "TENIS-38", balance: 3 }],
    });
    const { dependencies, requestListingSync } = dependenciesFor(bling.fetchImplementation);

    const outcome = await checkSupplierErpStock(dependencies, supplierId);

    expect(outcome).toBe("synced");
    expect(await productOf(productId)).toEqual({
      stock: 3,
      title: "Produto TENIS-38",
      erpProductId: 501,
    });
    expect((await productOf(planilhaOnly))?.stock).toBe(4);
    expect(requestListingSync).toHaveBeenCalledTimes(1);
  });

  it("reads a product sold out in Bling as zero", async () => {
    const supplierId = await createSupplier({ companyId: "company-a" });
    const productId = await createProduct(supplierId, { sku: "A", stock: 6, erpProductId: 7 });
    const bling = fakeBling({
      companyId: "company-a",
      products: [{ id: 7, codigo: "A", balance: 0 }],
    });
    const { dependencies } = dependenciesFor(bling.fetchImplementation);

    await checkSupplierErpStock(dependencies, supplierId);

    expect((await productOf(productId))?.stock).toBe(0);
  });

  it("does not ask the listings to sync when nothing changed", async () => {
    const supplierId = await createSupplier({ companyId: "company-a" });
    await createProduct(supplierId, { sku: "A", stock: 6, erpProductId: 7 });
    const bling = fakeBling({
      companyId: "company-a",
      products: [{ id: 7, codigo: "A", balance: 6 }],
    });
    const { dependencies, requestListingSync } = dependenciesFor(bling.fetchImplementation);

    await checkSupplierErpStock(dependencies, supplierId);

    expect(requestListingSync).not.toHaveBeenCalled();
  });

  it("leaves suppliers that do not issue their NF-e through SellBridge alone", async () => {
    const supplierId = await createSupplier({ invoiceEnabled: false });
    const productId = await createProduct(supplierId, { sku: "A", stock: 6 });
    const bling = fakeBling({
      companyId: "company-a",
      products: [{ id: 7, codigo: "A", balance: 1 }],
    });
    const { dependencies } = dependenciesFor(bling.fetchImplementation);

    const outcome = await checkSupplierErpStock(dependencies, supplierId);

    expect(outcome).toBe("skipped");
    expect(bling.paths).toEqual([]);
    expect((await productOf(productId))?.stock).toBe(6);
  });

  it("links the products again when the supplier connected another Bling company", async () => {
    const supplierId = await createSupplier({ companyId: "company-old" });
    const productId = await createProduct(supplierId, { sku: "A", stock: 6, erpProductId: 7 });
    const bling = fakeBling({
      companyId: "company-new",
      products: [{ id: 900, codigo: "A", balance: 2 }],
    });
    const { dependencies } = dependenciesFor(bling.fetchImplementation);

    await checkSupplierErpStock(dependencies, supplierId);

    expect(await productOf(productId)).toMatchObject({ stock: 2, erpProductId: 900 });
  });

  it("tells the team when Bling has fewer units than SellBridge already sold", async () => {
    const supplierId = await createSupplier({ companyId: "company-a" });
    await createProduct(supplierId, { sku: "A", stock: 5, erpProductId: 7, reservedStock: 2 });
    const bling = fakeBling({
      companyId: "company-a",
      products: [{ id: 7, codigo: "A", balance: 1 }],
    });
    const { dependencies } = dependenciesFor(bling.fetchImplementation);
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    await checkSupplierErpStock(dependencies, supplierId);

    expect(loggedEvents(error)).toContain("erp.stock_below_reserved");
  });

  it("tells the team when the check corrects stock but Bling sent no notice for a day", async () => {
    const supplierId = await createSupplier({
      companyId: "company-a",
      stockCheckedAt: new Date(Date.now() - 15 * 60_000),
      lastStockNoticeAt: new Date(Date.now() - 2 * 24 * 3600_000),
    });
    await createProduct(supplierId, { sku: "A", stock: 5, erpProductId: 7 });
    const bling = fakeBling({
      companyId: "company-a",
      products: [{ id: 7, codigo: "A", balance: 4 }],
    });
    const { dependencies } = dependenciesFor(bling.fetchImplementation);
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    await checkSupplierErpStock(dependencies, supplierId);

    expect(loggedEvents(error)).toContain("erp.stock_notices_missing");
  });

  it("does not raise the missing-notice alarm on the first check", async () => {
    const supplierId = await createSupplier({ companyId: "company-a" });
    await createProduct(supplierId, { sku: "A", stock: 5, erpProductId: 7 });
    const bling = fakeBling({
      companyId: "company-a",
      products: [{ id: 7, codigo: "A", balance: 4 }],
    });
    const { dependencies } = dependenciesFor(bling.fetchImplementation);
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

    await checkSupplierErpStock(dependencies, supplierId);

    expect(loggedEvents(error)).not.toContain("erp.stock_notices_missing");
  });

  it("reports a lost connection on the Problemas page and keeps the last stock", async () => {
    const supplierId = await createSupplier({ companyId: "company-a" });
    const productId = await createProduct(supplierId, { sku: "A", stock: 5, erpProductId: 7 });
    const bling = fakeBling({ companyId: "company-a", products: [], failWith: 401 });
    const { dependencies } = dependenciesFor(bling.fetchImplementation);
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    const outcome = await checkSupplierErpStock(dependencies, supplierId);

    expect(outcome).toBe("connection_lost");
    expect(loggedEvents(error)).toContain("erp.stock_connection_lost");
    expect((await productOf(productId))?.stock).toBe(5);
  });

  it("tells the team only from the third failed check in a row", async () => {
    const supplierId = await createSupplier({ companyId: "company-a" });
    await createProduct(supplierId, { sku: "A", stock: 5, erpProductId: 7 });
    const bling = fakeBling({ companyId: "company-a", products: [], failWith: 400 });
    const { dependencies } = dependenciesFor(bling.fetchImplementation);
    const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    await checkSupplierErpStock(dependencies, supplierId);
    await checkSupplierErpStock(dependencies, supplierId);
    expect(loggedEvents(error)).not.toContain("erp.stock_check_failed");
    await checkSupplierErpStock(dependencies, supplierId);

    expect(loggedEvents(error)).toContain("erp.stock_check_failed");
  });
});

describe("refreshSupplierErpStock", () => {
  it("reads only the products Bling notified about and pushes the change", async () => {
    const supplierId = await createSupplier({ companyId: "company-a" });
    const notified = await createProduct(supplierId, { sku: "A", stock: 5, erpProductId: 7 });
    const quiet = await createProduct(supplierId, { sku: "B", stock: 5, erpProductId: 8 });
    await recordErpStockNotice(database, {
      supplierIds: [supplierId],
      erpCompanyId: "company-a",
      erpProductIds: [7],
      receivedAt: new Date(),
    });
    const bling = fakeBling({
      companyId: "company-a",
      products: [
        { id: 7, codigo: "A", balance: 2 },
        { id: 8, codigo: "B", balance: 1 },
      ],
    });
    const { dependencies, requestListingSync } = dependenciesFor(bling.fetchImplementation);

    const outcome = await refreshSupplierErpStock(dependencies, supplierId);

    expect(outcome).toBe("synced");
    expect((await productOf(notified))?.stock).toBe(2);
    expect((await productOf(quiet))?.stock).toBe(5);
    expect(requestListingSync).toHaveBeenCalledTimes(1);
  });

  it("links a product the notice names when Bling's code matches its SKU", async () => {
    const supplierId = await createSupplier({ companyId: "company-a" });
    const productId = await createProduct(supplierId, { sku: "NOVO", stock: 0 });
    await recordErpStockNotice(database, {
      supplierIds: [supplierId],
      erpCompanyId: "company-a",
      erpProductIds: [42],
      receivedAt: new Date(),
    });
    const bling = fakeBling({
      companyId: "company-a",
      products: [{ id: 42, codigo: "NOVO", balance: 9 }],
    });
    const { dependencies } = dependenciesFor(bling.fetchImplementation);

    await refreshSupplierErpStock(dependencies, supplierId);

    expect(await productOf(productId)).toMatchObject({ stock: 9, erpProductId: 42 });
  });

  it("leaves pending notices alone when the token belongs to another company", async () => {
    const supplierId = await createSupplier({ companyId: "company-a" });
    const productId = await createProduct(supplierId, { sku: "A", stock: 5, erpProductId: 7 });
    await recordErpStockNotice(database, {
      supplierIds: [supplierId],
      erpCompanyId: "company-a",
      erpProductIds: [7],
      receivedAt: new Date(),
    });
    const bling = fakeBling({
      companyId: "company-b",
      products: [{ id: 7, codigo: "A", balance: 1 }],
    });
    const { dependencies, requestListingSync } = dependenciesFor(bling.fetchImplementation);

    expect(await refreshSupplierErpStock(dependencies, supplierId)).toBe("skipped");
    expect(await productOf(productId)).toMatchObject({ stock: 5, erpProductId: 7 });
    expect(requestListingSync).not.toHaveBeenCalled();
  });

  it("discards a balance returned after the supplier reconnects", async () => {
    const supplierId = await createSupplier({ companyId: "company-a" });
    const productId = await createProduct(supplierId, { sku: "A", stock: 5, erpProductId: 7 });
    await recordErpStockNotice(database, {
      supplierIds: [supplierId],
      erpCompanyId: "company-a",
      erpProductIds: [7],
      receivedAt: new Date(),
    });
    const bling = fakeBling({
      companyId: "company-a",
      products: [{ id: 7, codigo: "A", balance: 1 }],
    });
    const fetchAfterReconnect: typeof fetch = async (input, init) => {
      const { pathname } = requestUrl(input);
      if (pathname.endsWith("/estoques/saldos")) {
        await database
          .update(schema.supplierErpConnections)
          .set({ connectedAt: new Date(Date.now() + 60_000) })
          .where(eq(schema.supplierErpConnections.supplierId, supplierId));
      }

      return await bling.fetchImplementation(input, init);
    };
    const { dependencies, requestListingSync } = dependenciesFor(fetchAfterReconnect);

    expect(await refreshSupplierErpStock(dependencies, supplierId)).toBe("skipped");
    expect(await productOf(productId)).toMatchObject({ stock: 5, erpProductId: 7 });
    expect(requestListingSync).not.toHaveBeenCalled();
  });
});

describe("checkAllErpStock", () => {
  it("queues one full check per supplier whose stock follows Bling", async () => {
    const following = await createSupplier({});
    const notFollowing = await createSupplier({ invoiceEnabled: false });
    const bling = fakeBling({ companyId: "company-a", products: [] });
    const { dependencies, enqueueSupplierCheck } = dependenciesFor(bling.fetchImplementation);

    await checkAllErpStock(dependencies);

    const queued = enqueueSupplierCheck.mock.calls.map((call) => call[0]);
    expect(queued).toContain(following);
    expect(queued).not.toContain(notFollowing);
  });
});
