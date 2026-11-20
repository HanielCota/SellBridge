import { describe, expect, it, vi } from "vitest";
import { createBlingClient } from "./client.ts";
import { createBlingRateLimiter } from "./rate-limit.ts";
import { defaultBlingDepositId } from "./stock.ts";

const NOW = 1_800_000_000_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientAnswering(answer: (url: URL, init: RequestInit | undefined) => Response) {
  const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    return answer(url, init);
  });
  const client = createBlingClient({
    http: { fetchImplementation, retry: { sleep: async () => {}, random: () => 0, retries: 2 } },
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
  return { client, fetchImplementation };
}

describe("postStockExit", () => {
  it("posts an exit (operation S) of the product from the warehouse and returns its id", async () => {
    const sent: { url: string; method: string | undefined; body: unknown }[] = [];
    const { client } = clientAnswering((url, init) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      sent.push({ url: url.toString(), method: init?.method, body });
      return json(201, { data: { id: 9001 } });
    });

    const id = await client.postStockExit({
      erpProductId: 777,
      depositId: 14,
      quantity: 2,
      note: "SellBridge: pedido 2000012345",
    });

    expect(id).toBe(9001);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://api.bling.com.br/Api/v3/estoques");
    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.body).toEqual({
      produto: { id: 777 },
      deposito: { id: 14 },
      operacao: "S",
      quantidade: 2,
      observacoes: "SellBridge: pedido 2000012345",
    });
  });

  it("sends an exit only once when Bling's answer fails, so it never posts twice", async () => {
    const { client, fetchImplementation } = clientAnswering(() =>
      json(500, { error: { type: "INTERNAL", message: "erro" } }),
    );

    await expect(
      client.postStockExit({ erpProductId: 777, depositId: 14, quantity: 1, note: "x" }),
    ).rejects.toThrow("O Bling recusou o pedido (HTTP 500)");

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("refuses a quantity that is not a positive whole number without calling Bling", async () => {
    const { client, fetchImplementation } = clientAnswering(() => json(201, { data: { id: 1 } }));

    await expect(
      client.postStockExit({ erpProductId: 777, depositId: 14, quantity: 0, note: "x" }),
    ).rejects.toThrow(RangeError);
    await expect(
      client.postStockExit({ erpProductId: 777, depositId: 14, quantity: 1.5, note: "x" }),
    ).rejects.toThrow(RangeError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

describe("postStockEntry", () => {
  it("posts an entry (operation E) of the product into the warehouse and returns its id", async () => {
    const sent: unknown[] = [];
    const { client } = clientAnswering((_url, init) => {
      sent.push(typeof init?.body === "string" ? JSON.parse(init.body) : null);
      return json(201, { data: { id: 9002 } });
    });

    const id = await client.postStockEntry({
      erpProductId: 777,
      depositId: 14,
      quantity: 1,
      note: "SellBridge: devolução do pedido 2000012345",
    });

    expect(id).toBe(9002);
    expect(sent).toEqual([
      {
        produto: { id: 777 },
        deposito: { id: 14 },
        operacao: "E",
        quantidade: 1,
        observacoes: "SellBridge: devolução do pedido 2000012345",
      },
    ]);
  });
});

function clientWithDeposits(deposits: { id: number; situacao: number; padrao: boolean }[]) {
  return clientAnswering(() =>
    json(200, {
      data: deposits.map((deposit) => ({
        ...deposit,
        descricao: "Depósito",
        desconsiderarSaldo: false,
      })),
    }),
  ).client;
}

describe("defaultBlingDepositId", () => {
  it("takes the default active warehouse", async () => {
    const client = clientWithDeposits([
      { id: 1, situacao: 1, padrao: false },
      { id: 2, situacao: 1, padrao: true },
    ]);

    expect(await defaultBlingDepositId(client)).toBe(2);
  });

  it("takes the only active warehouse when none is marked default", async () => {
    const client = clientWithDeposits([{ id: 3, situacao: 1, padrao: false }]);

    expect(await defaultBlingDepositId(client)).toBe(3);
  });

  it("returns null when several are active and none is the default", async () => {
    const client = clientWithDeposits([
      { id: 1, situacao: 1, padrao: false },
      { id: 2, situacao: 1, padrao: false },
    ]);

    expect(await defaultBlingDepositId(client)).toBeNull();
  });

  it("ignores an inactive warehouse even when it is marked default", async () => {
    const client = clientWithDeposits([
      { id: 1, situacao: 0, padrao: true },
      { id: 2, situacao: 1, padrao: false },
    ]);

    expect(await defaultBlingDepositId(client)).toBe(2);
  });
});
