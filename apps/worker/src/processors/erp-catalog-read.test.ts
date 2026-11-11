import {
  deleteErpCatalogRead,
  findErpCatalogRead,
  startErpCatalogRead,
  upsertErpConnection,
} from "@sellbridge/database/repositories";
import { createBlingRateLimiter } from "@sellbridge/marketplaces/bling";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestProduct, createWorkerTestEnvironment } from "../testing/fixtures.ts";
import { createErpCatalogReadProcessor } from "./erp-catalog-read.ts";

const { database, cipher } = createWorkerTestEnvironment();
const credentials = { clientId: "id", clientSecret: "secret" };
const limiter = createBlingRateLimiter({ sleep: async () => {} });

let supplier: Awaited<ReturnType<typeof createTestProduct>>;

const product = {
  id: 10,
  nome: "Travesseiro Eco-Pluma",
  codigo: "054-TRA-ECO-BRA",
  preco: 39.9,
  situacao: "A",
  formato: "S",
  unidade: "UN",
  pesoBruto: 0.6,
  tributacao: { origem: 0, ncm: "9404.90.00" },
  estoque: { saldoVirtualTotal: 100 },
  midia: { imagens: { externas: [{ link: "https://cdn.exemplo.com/t.jpg" }] } },
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === "string") {
    return new URL(input);
  }
  return input instanceof URL ? input : new URL(input.url);
}

beforeAll(async () => {
  supplier = await createTestProduct(database, {
    sku: `READ-${crypto.randomUUID().slice(0, 8)}`,
    title: "Travesseiro",
    stock: 5,
  });
  await upsertErpConnection(database, {
    supplierId: supplier.supplierId,
    provider: "bling",
    userId: null,
    tokens: {
      accessTokenEnc: cipher.encrypt("access"),
      refreshTokenEnc: cipher.encrypt("refresh"),
      expiresAt: new Date(Date.now() + 6 * 3600_000),
    },
  });
});

afterAll(async () => {
  await supplier.cleanup();
  await database.$client.end();
});

function key() {
  return { supplierId: supplier.supplierId, provider: "bling" as const };
}

describe("erp catalog read", () => {
  it("stores the catalog and how many products it read", async () => {
    const read = await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith("/produtos")) {
        return json(200, {
          data: [
            { id: 10, nome: product.nome, codigo: product.codigo, formato: "S", situacao: "A" },
          ],
        });
      }
      return json(200, { data: product });
    });
    const process = createErpCatalogReadProcessor({
      database,
      cipher,
      blingCredentials: credentials,
      limiter,
      fetchImplementation,
    });

    const outcome = await process({ supplierId: supplier.supplierId, readId: read.id });

    expect(outcome).toBe("ready");
    const stored = await findErpCatalogRead(database, key());
    expect(stored).toMatchObject({ status: "ready", readProducts: 1, totalProducts: 1 });
    expect(stored?.result).toMatchObject({
      items: [{ sku: "054-TRA-ECO-BRA", priceCents: 3990 }],
      truncated: false,
    });
  });

  it("ends the read with a reason the supplier can act on when Bling fails", async () => {
    const read = await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });
    const fetchImplementation = vi.fn<typeof fetch>(async () => json(500, { error: {} }));
    const process = createErpCatalogReadProcessor({
      database,
      cipher,
      blingCredentials: credentials,
      limiter,
      fetchImplementation,
    });

    const outcome = await process({ supplierId: supplier.supplierId, readId: read.id });

    expect(outcome).toBe("failed");
    expect(await findErpCatalogRead(database, key())).toMatchObject({
      status: "failed",
      error: "Não foi possível ler o seu Bling agora. Tente de novo em alguns minutos.",
    });
  });

  it("fails the read without calling Bling while the keys are not configured", async () => {
    const read = await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });
    const fetchImplementation = vi.fn<typeof fetch>();
    const process = createErpCatalogReadProcessor({
      database,
      cipher,
      blingCredentials: null,
      limiter,
      fetchImplementation,
    });

    const outcome = await process({ supplierId: supplier.supplierId, readId: read.id });

    expect(outcome).toBe("failed");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("does not call Bling for a read the supplier discarded before it ran", async () => {
    const read = await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });
    await deleteErpCatalogRead(database, key());
    const fetchImplementation = vi.fn<typeof fetch>(async () => json(200, { data: [] }));
    const process = createErpCatalogReadProcessor({
      database,
      cipher,
      blingCredentials: credentials,
      limiter,
      fetchImplementation,
    });

    const outcome = await process({ supplierId: supplier.supplierId, readId: read.id });

    expect(outcome).toBe("superseded");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("stops reading once a newer read replaced it", async () => {
    const read = await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });
    const listed = [10, 11, 12].map((id) => ({
      id,
      nome: `${product.nome} ${id}`,
      codigo: `${product.codigo}-${id}`,
      formato: "S",
      situacao: "A",
    }));
    const fetchImplementation = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith("/produtos")) {
        return json(200, { data: url.searchParams.get("pagina") === "1" ? listed : [] });
      }
      const id = Number(url.pathname.split("/").at(-1));
      if (id === 10) {
        await startErpCatalogRead(database, { ...key(), ttlMilliseconds: 60_000 });
      }
      return json(200, { data: { ...product, id, codigo: `${product.codigo}-${id}` } });
    });
    const process = createErpCatalogReadProcessor({
      database,
      cipher,
      blingCredentials: credentials,
      limiter,
      fetchImplementation,
    });

    const outcome = await process({ supplierId: supplier.supplierId, readId: read.id });

    expect(outcome).toBe("superseded");
    const detailCalls = fetchImplementation.mock.calls.filter(
      ([input]) => !requestUrl(input).pathname.endsWith("/produtos"),
    );
    expect(detailCalls).toHaveLength(1);
  });
});
