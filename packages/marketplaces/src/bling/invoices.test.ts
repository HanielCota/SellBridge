import { describe, expect, it, vi } from "vitest";
import { createBlingClient } from "./client.ts";
import { createBlingRateLimiter } from "./rate-limit.ts";

const NOW = 1_800_000_000_000;
const ADDRESS = {
  street: "Rua das Flores",
  number: "10",
  complement: "Apto 2",
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
  postalCode: "01001000",
};

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
      accountKey: "supplier-1",
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

type FetchMock = ReturnType<typeof setup>["fetchImplementation"];

function sentRequest(fetchImplementation: FetchMock, index = 0) {
  const [input, init] = fetchImplementation.mock.calls[index] ?? [];
  const url = input instanceof Request ? input.url : String(input ?? "");
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
  return { url, method: init?.method ?? "GET", body };
}

describe("Bling contact calls", () => {
  it("finds a contact by its CPF", async () => {
    const { client, fetchImplementation } = setup(json(200, { data: [{ id: 77 }] }));

    const id = await client.findContactByDocument("52998224725");

    expect(id).toBe(77);
    expect(sentRequest(fetchImplementation).url).toContain("numeroDocumento=52998224725");
  });

  it("leaves a known contact alone when Bling already has this address", async () => {
    const { client, fetchImplementation } = setup(
      json(200, {
        data: {
          id: 77,
          nome: "Maria Silva",
          endereco: {
            geral: {
              endereco: "Rua das Flores",
              numero: "10",
              complemento: "Apto 2",
              bairro: "Centro",
              municipio: "São Paulo",
              uf: "SP",
              cep: "01001-000",
            },
          },
        },
      }),
    );

    await client.updateContactAddress(77, ADDRESS);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(sentRequest(fetchImplementation).url).toContain("/contatos/77");
  });

  it("creates a person as a non-taxpayer with the delivery address", async () => {
    const { client, fetchImplementation } = setup(json(201, { data: { id: 78 } }));

    const id = await client.createContact({
      name: "Maria Silva",
      personType: "F",
      document: "52998224725",
      stateRegistration: null,
      address: ADDRESS,
    });

    expect(id).toBe(78);
    expect(sentRequest(fetchImplementation).body).toMatchObject({
      nome: "Maria Silva",
      tipo: "F",
      numeroDocumento: "52998224725",
      indicadorIe: 9,
      endereco: { geral: { municipio: "São Paulo", uf: "SP", cep: "01001000" } },
    });
  });

  it("creates a company with a state registration as a taxpayer", async () => {
    const { client, fetchImplementation } = setup(json(201, { data: { id: 79 } }));

    await client.createContact({
      name: "Loja Exemplo Ltda",
      personType: "J",
      document: "45723174000110",
      stateRegistration: "30703088534",
      address: ADDRESS,
    });

    expect(sentRequest(fetchImplementation).body).toMatchObject({
      tipo: "J",
      indicadorIe: 1,
      ie: "30703088534",
    });
  });
});

describe("Bling sale order and NF-e calls", () => {
  it("creates the sale order with the marketplace number and items by SKU, without a delivery place", async () => {
    const { client, fetchImplementation } = setup(json(201, { data: { id: 500 } }));

    const id = await client.createSaleOrder({
      storeOrderNumber: "2000010733434062",
      date: "2026-11-10",
      contact: { id: 78, name: "Maria Silva" },
      items: [
        {
          sku: "SB-1",
          productId: 10,
          description: "Chinelo",
          unit: "PAR",
          quantity: 2,
          unitPriceCents: 4990,
        },
      ],
      notes: "Pedido 2000010733434062",
    });

    expect(id).toBe(500);
    const request = sentRequest(fetchImplementation);
    expect(request.method).toBe("POST");
    expect(request.body).toMatchObject({
      numeroLoja: "2000010733434062",
      contato: { id: 78 },
      itens: [{ codigo: "SB-1", produto: { id: 10 }, quantidade: 2, valor: 49.9, unidade: "PAR" }],
    });
    expect(request.body).not.toHaveProperty("transporte");
  });

  it("returns the note id generated from the sale order", async () => {
    const { client, fetchImplementation } = setup(json(201, { data: { idNotaFiscal: 900 } }));

    const id = await client.generateInvoice(500);

    expect(id).toBe(900);
    expect(sentRequest(fetchImplementation).url).toMatch(/\/pedidos\/vendas\/500\/gerar-nfe$/);
  });

  it("reads the note's number, key, DANFE link and each line's CFOP", async () => {
    const { client } = setup(
      json(200, {
        data: {
          situacao: 5,
          numero: "1234",
          serie: 1,
          chaveAcesso: "31261111222333000181550010000012341000012345",
          linkDanfe: "https://www.bling.com.br/doc.view.php?id=abc",
          itens: [{ codigo: "SB-1", cfop: "6108" }],
        },
      }),
    );

    const invoice = await client.getInvoice(900);

    expect(invoice).toEqual({
      situacao: 5,
      number: "1234",
      series: "1",
      accessKey: "31261111222333000181550010000012341000012345",
      danfeUrl: "https://www.bling.com.br/doc.view.php?id=abc",
      lines: [{ sku: "SB-1", cfop: "6108" }],
    });
  });

  it("keeps no DANFE link that is not a web address", async () => {
    const { client } = setup(
      json(200, { data: { situacao: 5, linkDanfe: "javascript:alert(1)" } }),
    );

    const invoice = await client.getInvoice(900);

    expect(invoice.danfeUrl).toBeNull();
  });

  it("sends the note to SEFAZ without Bling's e-mail", async () => {
    const { client, fetchImplementation } = setup(json(200, { data: { xml: "<nfe/>" } }));

    await client.sendInvoice(900);

    expect(sentRequest(fetchImplementation).url).toMatch(/\/nfe\/900\/enviar\?enviarEmail=false$/);
  });

  it("carries Bling's field messages on a refusal", async () => {
    const { client } = setup(
      json(400, {
        error: {
          type: "VALIDATION_ERROR",
          message: "Não foi possível salvar a venda",
          description: "Erro de validação",
          fields: [{ code: 1, msg: "O contato informado não existe" }],
        },
      }),
    );

    const creation = client.generateInvoice(500);

    await expect(creation).rejects.toMatchObject({
      details: { retryable: false, issues: ["O contato informado não existe"] },
    });
  });
});
