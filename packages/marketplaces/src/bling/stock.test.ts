import { describe, expect, it } from "vitest";
import { createBlingClient } from "./client.ts";
import { createBlingRateLimiter } from "./rate-limit.ts";
import { blingStockUnits, findBlingIdsBySku, readBlingStock } from "./stock.ts";

const NOW = 1_800_000_000_000;

interface Balance {
  readonly id: number;
  readonly codigo: string;
  readonly saldoVirtualTotal: number;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function urlOf(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === "string") {
    return new URL(input);
  }
  return input instanceof URL ? input : new URL(input.url);
}

/** A Bling that filters balances the documented way: positive, zero or negative. */
function fakeBling(
  balances: readonly Balance[],
  products: readonly { id: number; codigo: string }[] = [],
) {
  const requests: URL[] = [];
  const fetchImplementation: typeof fetch = async (input) => {
    const url = urlOf(input);
    requests.push(url);
    if (url.pathname.endsWith("/estoques/saldos")) {
      const ids = new Set(url.searchParams.getAll("idsProdutos[]").map(Number));
      const filter = Number(url.searchParams.get("filtroSaldoEstoque") ?? "1");
      const matches = balances.filter((balance) => {
        if (!ids.has(balance.id)) {
          return false;
        }
        if (filter === 0) {
          return balance.saldoVirtualTotal === 0;
        }
        return filter === 1 ? balance.saldoVirtualTotal > 0 : balance.saldoVirtualTotal < 0;
      });
      return json({
        data: matches.map((balance) => ({
          produto: { id: balance.id, codigo: balance.codigo },
          saldoFisicoTotal: balance.saldoVirtualTotal,
          saldoVirtualTotal: balance.saldoVirtualTotal,
        })),
      });
    }
    if (url.pathname.endsWith("/produtos")) {
      const codes = new Set(url.searchParams.getAll("codigos[]"));
      return json({
        data: products
          .filter((product) => codes.has(product.codigo))
          .map((product) => ({ ...product, nome: product.codigo, formato: "S", situacao: "A" })),
      });
    }
    throw new Error(`unexpected request ${url.pathname}`);
  };
  const client = createBlingClient({
    http: { fetchImplementation, retry: { sleep: async () => {}, random: () => 0, retries: 0 } },
    limiter: createBlingRateLimiter({ sleep: async () => {} }),
    access: {
      accountKey: "supplier-1",
      currentTokens: async () => ({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: new Date(NOW + 3_600_000),
      }),
      refresh: async () => {
        throw new Error("no refresh expected");
      },
    },
    now: () => NOW,
  });
  return { client, requests };
}

describe("blingStockUnits", () => {
  it("rounds a fractional balance down to whole units", () => {
    expect(blingStockUnits(4.9)).toBe(4);
  });

  it("offers nothing when Bling's balance is negative", () => {
    expect(blingStockUnits(-3)).toBe(0);
  });

  it("returns null for a missing or non-finite balance", () => {
    expect(blingStockUnits(null)).toBeNull();
    expect(blingStockUnits(undefined)).toBeNull();
    expect(blingStockUnits(Number.NaN)).toBeNull();
    expect(blingStockUnits(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("readBlingStock", () => {
  it("asks only the positive balances when Bling answers every product", async () => {
    const { client, requests } = fakeBling([
      { id: 1, codigo: "A", saldoVirtualTotal: 5 },
      { id: 2, codigo: "B", saldoVirtualTotal: 2.5 },
    ]);

    const read = await readBlingStock(client, [1, 2]);

    expect(read.readings).toEqual([
      { erpProductId: 1, sku: "A", stock: 5 },
      { erpProductId: 2, sku: "B", stock: 2 },
    ]);
    expect(read.missing).toEqual([]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.searchParams.get("filtroSaldoEstoque")).toBe("1");
  });

  it("reads a sold-out product as zero instead of leaving its old stock", async () => {
    const { client } = fakeBling([
      { id: 1, codigo: "A", saldoVirtualTotal: 5 },
      { id: 2, codigo: "B", saldoVirtualTotal: 0 },
      { id: 3, codigo: "C", saldoVirtualTotal: -2 },
    ]);

    const read = await readBlingStock(client, [1, 2, 3]);

    expect(read.readings).toEqual([
      { erpProductId: 1, sku: "A", stock: 5 },
      { erpProductId: 2, sku: "B", stock: 0 },
      { erpProductId: 3, sku: "C", stock: 0 },
    ]);
    expect(read.missing).toEqual([]);
  });

  it("reports the ids Bling answers under no filter as missing", async () => {
    const { client } = fakeBling([{ id: 1, codigo: "A", saldoVirtualTotal: 5 }]);

    const read = await readBlingStock(client, [1, 99]);

    expect(read.readings).toEqual([{ erpProductId: 1, sku: "A", stock: 5 }]);
    expect(read.missing).toEqual([99]);
  });

  it("splits more than 100 products into requests of 100", async () => {
    const balances = Array.from({ length: 150 }, (_value, index) => ({
      id: index + 1,
      codigo: `SKU-${index + 1}`,
      saldoVirtualTotal: 1,
    }));
    const { client, requests } = fakeBling(balances);

    const read = await readBlingStock(
      client,
      balances.map((balance) => balance.id),
    );

    expect(read.readings).toHaveLength(150);
    expect(requests.map((url) => url.searchParams.getAll("idsProdutos[]").length)).toEqual([
      100, 50,
    ]);
  });
});

describe("findBlingIdsBySku", () => {
  it("links each SKU Bling holds on exactly one product", async () => {
    const { client } = fakeBling(
      [],
      [
        { id: 10, codigo: "A" },
        { id: 20, codigo: "B" },
        { id: 21, codigo: "B" },
      ],
    );

    const links = await findBlingIdsBySku(client, ["A", "B", "C"]);

    expect(links).toEqual([{ sku: "A", erpProductId: 10 }]);
  });
});
