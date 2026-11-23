import { describe, expect, it, vi } from "vitest";
import { createBlingClient } from "./client.ts";
import type { BlingNewDirectInvoice } from "./direct-invoices.ts";
import { createBlingRateLimiter } from "./rate-limit.ts";

const NOW = 1_800_000_000_000;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setup(...responses: Response[]) {
  const fetchImplementation = vi.fn<typeof fetch>();
  for (const response of responses) {
    fetchImplementation.mockResolvedValueOnce(response);
  }
  const client = createBlingClient({
    http: { fetchImplementation, retry: { sleep: async () => {}, random: () => 0, retries: 0 } },
    limiter: createBlingRateLimiter({ sleep: async () => {} }),
    access: {
      accountKey: "reseller-1",
      currentTokens: async () => ({
        accessToken: "access",
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

function sentBody(fetchImplementation: ReturnType<typeof setup>["fetchImplementation"]): unknown {
  const [, init] = fetchImplementation.mock.calls[0] ?? [];
  return typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
}

const REMESSA_FIELDS = {
  operationId: 77,
  contactId: 12,
  operationDate: "2026-11-20 10:00:00",
  items: [
    {
      sku: "VEST-01",
      description: "Vestido midi",
      unit: "UN",
      quantity: 1,
      unitPriceCents: 9_990,
      ncm: "62044300",
      origin: 0,
      cfop: "6120",
    },
  ],
  referencedInvoice: null,
  draftReference: "SellBridge venda abc",
  notes: "Pedido 7700123, enviado pelo SellBridge.",
} satisfies BlingNewDirectInvoice;

const SALE: BlingNewDirectInvoice = {
  ...REMESSA_FIELDS,
  intermediary: { cnpj: "03007331000141", userName: "JULIANA.COSTA" },
  installments: [
    { date: "2026-11-19", amountCents: 9_990, paymentMethodId: 501, authorizationCode: "008877" },
  ],
};

describe("createDirectInvoice", () => {
  it("sends a sale with its intermediary and card payment, citing no other note", async () => {
    const { client, fetchImplementation } = setup(json(201, { data: { id: 9001 } }));

    const id = await client.createDirectInvoice(SALE);

    expect(id).toBe(9001);
    const body = sentBody(fetchImplementation);
    expect(body).not.toHaveProperty("documentoReferenciado");
    expect(body).toMatchObject({
      intermediador: { cnpj: "03007331000141", nomeUsuario: "JULIANA.COSTA" },
      parcelas: [{ data: "2026-11-19", valor: 99.9, formaPagamento: { id: 501 }, caut: "008877" }],
    });
  });

  it("leaves the authorization code out of a payment without one", async () => {
    const { client, fetchImplementation } = setup(json(201, { data: { id: 9002 } }));

    await client.createDirectInvoice({
      ...SALE,
      installments: [
        { date: "2026-11-19", amountCents: 9_990, paymentMethodId: 502, authorizationCode: null },
      ],
    });

    expect(sentBody(fetchImplementation)).toMatchObject({
      parcelas: [{ data: "2026-11-19", valor: 99.9, formaPagamento: { id: 502 } }],
    });
    expect(JSON.stringify(sentBody(fetchImplementation))).not.toContain("caut");
  });

  it("cites the referenced note and sends no channel data for a remessa", async () => {
    const { client, fetchImplementation } = setup(json(201, { data: { id: 9003 } }));

    await client.createDirectInvoice({
      ...REMESSA_FIELDS,
      referencedInvoice: {
        accessKey: "35261111222333000181550010000048211123456789",
        number: "4821",
        series: "1",
        yearMonth: "2611",
      },
    });

    const body = sentBody(fetchImplementation);
    expect(body).toMatchObject({
      documentoReferenciado: {
        modelo: "55",
        chaveAcesso: "35261111222333000181550010000048211123456789",
        data: "2611",
        numero: "4821",
        serie: "1",
      },
    });
    expect(body).not.toHaveProperty("intermediador");
    expect(body).not.toHaveProperty("parcelas");
  });
});

describe("listPaymentMethods", () => {
  it("reads the card brand of card methods only", async () => {
    const { client, fetchImplementation } = setup(
      json(200, {
        data: [
          { id: 1, descricao: " Pix ", tipoPagamento: 17 },
          { id: 2, descricao: "Crédito Visa", tipoPagamento: 3 },
        ],
      }),
      json(200, { data: { dadosCartao: { bandeira: 1 } } }),
    );

    const methods = await client.listPaymentMethods();

    expect(methods).toEqual([
      { id: 1, name: "Pix", type: 17, cardBrand: null },
      { id: 2, name: "Crédito Visa", type: 3, cardBrand: 1 },
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const [detail] = fetchImplementation.mock.calls[1] ?? [];
    const detailUrl = detail instanceof Request ? detail.url : String(detail ?? "");
    expect(detailUrl).toContain("/formas-pagamentos/2");
  });
});
