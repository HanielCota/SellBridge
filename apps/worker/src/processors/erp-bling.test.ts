import { schema } from "@sellbridge/database";
import { findErpConnection, upsertErpConnection } from "@sellbridge/database/repositories";
import { createBlingRateLimiter } from "@sellbridge/marketplaces/bling";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestProduct, createWorkerTestEnvironment } from "../testing/fixtures.ts";
import {
  createErpCatalogExportProcessor,
  gramsFromAttribute,
  toBlingNewProduct,
} from "./erp-catalog-export.ts";
import { createErpTokenRefreshProcessor, runTokenRefreshes } from "./erp-token-refresh.ts";

const { database, cipher } = createWorkerTestEnvironment();
const credentials = { clientId: "id", clientSecret: "secret" };
const limiter = createBlingRateLimiter({ sleep: async () => {} });

let supplier: Awaited<ReturnType<typeof createTestProduct>>;
const existingSku = `BLING-${crypto.randomUUID().slice(0, 8)}`;
let newSku = "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === "string") {
    return new URL(input);
  }
  return input instanceof URL ? input : new URL(input.url);
}

async function connect(expiresAt: Date) {
  return upsertErpConnection(database, {
    supplierId: supplier.supplierId,
    provider: "bling",
    userId: null,
    tokens: {
      accessTokenEnc: cipher.encrypt("access"),
      refreshTokenEnc: cipher.encrypt("refresh"),
      expiresAt,
    },
  });
}

beforeAll(async () => {
  supplier = await createTestProduct(database, {
    sku: existingSku,
    title: "Travesseiro",
    stock: 5,
  });
  newSku = `NOVO-${crypto.randomUUID().slice(0, 8)}`;
  await database.insert(schema.supplierProducts).values({
    supplierId: supplier.supplierId,
    sku: newSku,
    title: "Chinelo",
    costCents: 6990,
    suggestedPriceCents: 9990,
    mercadoLivreAttributes: { SELLER_PACKAGE_WEIGHT: "350 g" },
  });
});

afterAll(async () => {
  await supplier.cleanup();
  await database.$client.end();
});

describe("toBlingNewProduct", () => {
  it("sends the suggested retail price as Bling's price and reads the package weight", () => {
    const product = toBlingNewProduct({
      id: "p1",
      sku: "SB-1",
      title: "Chinelo",
      description: "",
      costCents: 6990,
      suggestedPriceCents: 9990,
      imageUrls: [],
      attributes: { SELLER_PACKAGE_WEIGHT: "350 g", GTIN: "7891234567895" },
    });

    expect(product).toMatchObject({ priceCents: 9990, weightGrams: 350, gtin: "7891234567895" });
  });

  it("reads no weight from a value that is not grams", () => {
    expect(gramsFromAttribute("abc")).toBeNull();
    expect(gramsFromAttribute(undefined)).toBeNull();
  });
});

describe("erp catalog export", () => {
  it("creates only the SKUs Bling does not have and never changes the others", async () => {
    await connect(new Date(Date.now() + 6 * 3600_000));
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = requestUrl(input);
      if (init?.method === "POST") {
        return json(201, { data: { id: 99 } });
      }
      const asked = url.searchParams.getAll("codigos[]");
      const found = asked.includes(existingSku)
        ? [{ id: 1, nome: "Travesseiro", codigo: existingSku, formato: "S", situacao: "A" }]
        : [];
      return json(200, { data: found });
    });
    const process = createErpCatalogExportProcessor({
      database,
      cipher,
      blingCredentials: credentials,
      limiter,
      fetchImplementation,
    });

    const summary = await process({ supplierId: supplier.supplierId });

    expect(summary).toEqual({ created: 1, alreadyInErp: 1, refused: 0 });
    const methods = fetchImplementation.mock.calls.map(([, init]) => init?.method ?? "GET");
    expect(methods.filter((method) => method !== "GET")).toEqual(["POST"]);
  });

  it("stops when Bling refuses the account instead of counting every product as refused", async () => {
    await connect(new Date(Date.now() + 6 * 3600_000));
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith("/oauth/token")) {
        return json(400, { error: { type: "invalid_grant" } });
      }
      if (init?.method === "POST") {
        return json(401, { error: { type: "invalid_token" } });
      }
      return json(200, { data: [] });
    });
    const process = createErpCatalogExportProcessor({
      database,
      cipher,
      blingCredentials: credentials,
      limiter,
      fetchImplementation,
    });

    const exporting = process({ supplierId: supplier.supplierId });

    await expect(exporting).rejects.toThrow("Conecte o Bling de novo");
    const creations = fetchImplementation.mock.calls.filter(
      ([input, init]) =>
        init?.method === "POST" && requestUrl(input).pathname.endsWith("/produtos"),
    );
    expect(creations).toHaveLength(1);
  });
});

describe("erp token refresh", () => {
  it("renews the Bling tokens even when the store refresh fails in the same job", async () => {
    const erp = vi.fn<() => Promise<string>>(async () => "erp renewed");

    const running = runTokenRefreshes({
      stores: async () => {
        throw new Error("store refresh failed");
      },
      erp,
    });

    await expect(running).rejects.toThrow("store refresh failed");
    expect(erp).toHaveBeenCalledTimes(1);
  });

  it("renews an expiring Bling connection and keeps it connected", async () => {
    await connect(new Date(Date.now() + 60_000));
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      json(200, {
        access_token: "a2",
        refresh_token: "r2",
        expires_in: 21600,
        token_type: "Bearer",
      }),
    );
    const process = createErpTokenRefreshProcessor({
      database,
      cipher,
      blingCredentials: credentials,
      fetchImplementation,
    });

    await process();

    const saved = await findErpConnection(database, {
      supplierId: supplier.supplierId,
      provider: "bling",
    });
    expect(saved?.status).toBe("connected");
    expect(cipher.decrypt(saved?.refreshTokenEnc ?? "")).toBe("r2");
  });

  it("expires the connection when Bling refuses the refresh token", async () => {
    await connect(new Date(Date.now() + 60_000));
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      json(400, { error: { type: "invalid_grant", message: "x" } }),
    );
    const process = createErpTokenRefreshProcessor({
      database,
      cipher,
      blingCredentials: credentials,
      fetchImplementation,
    });

    await process();

    const [saved] = await database
      .select({ status: schema.supplierErpConnections.status })
      .from(schema.supplierErpConnections)
      .where(eq(schema.supplierErpConnections.supplierId, supplier.supplierId));
    expect(saved?.status).toBe("expired");
  });

  it("does nothing while the Bling keys are not configured", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const process = createErpTokenRefreshProcessor({
      database,
      cipher,
      blingCredentials: null,
      fetchImplementation,
    });

    const summary = await process();

    expect(summary.refreshed + summary.failed).toBe(0);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
