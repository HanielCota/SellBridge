import { gzipSync } from "node:zlib";
import { schema } from "@sellbridge/database";
import {
  createInvoiceScenario,
  TEST_SUPPLIER_FISCAL,
} from "@sellbridge/database/testing/shipment-invoice";
import type { BuyerBilling, MercadoLivreSalePayments } from "@sellbridge/marketplaces";
import { createBlingRateLimiter } from "@sellbridge/marketplaces/bling";
import {
  defaultResellerBlingSettings,
  type ResellerBlingSettings,
} from "@sellbridge/shared/reseller-bling";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerTestEnvironment } from "../testing/fixtures.ts";
import { resellerBlingClient } from "./erp-bling-client.ts";
import { createResellerInvoiceReadProcessor } from "./reseller-invoice-read.ts";
import type { ResellerSaleIssueDependencies } from "./reseller-sale-issue.ts";

// Venda à ordem with the reseller's own Bling: note 1 issued there and passed on to Mercado Livre.
const { database, cipher } = createWorkerTestEnvironment();
const credentials = { clientId: "id", clientSecret: "secret" };
const cleanups: (() => Promise<void>)[] = [];

/** The note the fake Bling authorizes: CNPJ 45.723.174/0001-10 (the scenario's reseller), number 79. */
const BLING_KEY = "31261145723174000110550010000000791000000791";
const SALE_OPERATION = 77;
const CARD_METHOD = 501;
const PERSON: BuyerBilling = {
  documentType: "CPF",
  document: "52998224725",
  name: "Maria Silva",
  stateRegistration: null,
};
const CARD_SALE: MercadoLivreSalePayments = {
  payments: [
    { type: "credit_card", methodId: "master", authorizationCode: "008877", amountCents: 12_990 },
  ],
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === "string") {
    return new URL(input);
  }
  return input instanceof URL ? input : new URL(input.url);
}

function authorizedXml(): string {
  return [
    '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">',
    `<NFe><infNFe versao="4.00" Id="NFe${BLING_KEY}"></infNFe></NFe>`,
    `<protNFe><infProt><chNFe>${BLING_KEY}</chNFe><cStat>100</cStat></infProt></protNFe>`,
    "</nfeProc>",
  ].join("");
}

/** A Bling that keeps one note: pending until sent, then authorized with BLING_KEY. */
function fakeBling(sku: string) {
  const state = { created: null as unknown, sent: false };
  const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/contatos") && method === "GET") {
      return json(200, { data: [] });
    }
    if (url.pathname.endsWith("/contatos") && method === "POST") {
      return json(201, { data: { id: 12 } });
    }
    if (url.pathname.endsWith("/nfe") && method === "POST") {
      state.created = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : null;
      return json(201, { data: { id: 9001 } });
    }
    if (url.pathname.endsWith("/nfe/9001/enviar")) {
      state.sent = true;
      return json(200, { data: {} });
    }
    if (url.pathname.endsWith("/nfe/9001")) {
      const itens = [{ codigo: sku, cfop: "6120" }];
      return state.sent
        ? json(200, {
            data: { situacao: 5, numero: "79", serie: "1", chaveAcesso: BLING_KEY, itens },
          })
        : json(200, { data: { situacao: 1, itens } });
    }
    if (url.pathname.endsWith(`/nfe/documento/${BLING_KEY}`)) {
      const conteudo = gzipSync(Buffer.from(authorizedXml())).toString("base64");
      return json(200, { data: [{ conteudo }] });
    }
    return json(404, { error: { message: `unexpected ${method} ${url.pathname}` } });
  });
  return { state, fetchImplementation };
}

async function scenario(settings: ResellerBlingSettings) {
  const created = await createInvoiceScenario(database, {
    supplierFiscal: { ...TEST_SUPPLIER_FISCAL, invoiceModel: "on_behalf" },
    marketplace: "mercado_livre",
  });
  cleanups.push(created.cleanup);
  await database.insert(schema.resellerErpConnections).values({
    tenantId: created.tenantId,
    provider: "bling",
    accessTokenEnc: cipher.encrypt("access"),
    refreshTokenEnc: cipher.encrypt("refresh"),
    expiresAt: new Date(Date.now() + 3_600_000),
    saleNotesEnabledAt: new Date(Date.now() - 3_600_000),
    saleNoteSettings: settings,
  });
  return created;
}

function processor(input: {
  fetchImplementation: typeof fetch;
  sale: MercadoLivreSalePayments;
  sendSaleInvoice: ResellerSaleIssueDependencies["sendSaleInvoice"];
  now: () => Date;
}) {
  return createResellerInvoiceReadProcessor({
    database,
    now: input.now,
    readSaleInvoice: async () => {
      throw new Error("a note the reseller's Bling issues is never read from the marketplace");
    },
    issue: {
      database,
      clientFor: (tenantId) =>
        resellerBlingClient(
          {
            database,
            cipher,
            blingCredentials: credentials,
            limiter: createBlingRateLimiter({ sleep: async () => {} }),
            fetchImplementation: input.fetchImplementation,
          },
          tenantId,
        ),
      readBuyerBilling: async () => PERSON,
      readSalePayments: async () => input.sale,
      sendSaleInvoice: input.sendSaleInvoice,
    },
  });
}

/** The reseller's Mercado Livre account name, as connecting the shop saves it. */
async function nameShop(tenantId: string, shopName: string) {
  await database
    .update(schema.storeConnections)
    .set({ shopName })
    .where(eq(schema.storeConnections.tenantId, tenantId));
}

async function noteOf(shipmentId: string) {
  const [row] = await database
    .select()
    .from(schema.shipmentResellerInvoices)
    .where(eq(schema.shipmentResellerInvoices.shipmentId, shipmentId));
  return row;
}

const settingsWithCard: ResellerBlingSettings = {
  ...defaultResellerBlingSettings(),
  operationId: SALE_OPERATION,
  paymentMethods: { credit_mastercard: CARD_METHOD },
};

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

afterAll(async () => {
  await database.$client.end();
});

describe("the reseller's sale note issued by its own Bling", () => {
  it("creates the note with Mercado Livre and the card, sends it and passes its XML on", async () => {
    const { shipmentId, tenantId, sku } = await scenario(settingsWithCard);
    await nameShop(tenantId, "ANA.REVENDA");
    const bling = fakeBling(sku);
    const sendSaleInvoice = vi.fn<ResellerSaleIssueDependencies["sendSaleInvoice"]>(async () => {});
    let clock = Date.now();
    const run = processor({
      ...bling,
      sale: CARD_SALE,
      sendSaleInvoice,
      now: () => new Date(clock),
    });

    await run();
    clock += 3_600_000;
    await run();

    expect(bling.state.created).toMatchObject({
      naturezaOperacao: { id: SALE_OPERATION },
      contato: { id: 12 },
      intermediador: { cnpj: "03007331000141", nomeUsuario: "ANA.REVENDA" },
      parcelas: [{ formaPagamento: { id: CARD_METHOD }, caut: "008877" }],
      itens: [{ codigo: sku, cfop: "6120" }],
    });
    expect(sendSaleInvoice).toHaveBeenCalledWith(expect.anything(), {
      accessKey: BLING_KEY,
      xml: authorizedXml(),
    });
    expect(await noteOf(shipmentId)).toMatchObject({
      accessKey: BLING_KEY,
      number: "79",
      source: "bling",
      erpInvoiceId: 9001,
    });
  });

  it("stops and says which payment method to create when the reseller's Bling has none", async () => {
    const { shipmentId, sku } = await scenario({ ...settingsWithCard, paymentMethods: {} });
    const bling = fakeBling(sku);
    const run = processor({
      ...bling,
      sale: CARD_SALE,
      sendSaleInvoice: async () => {},
      now: () => new Date(),
    });

    await run();

    const note = await noteOf(shipmentId);
    expect(note?.erpStoppedAt).not.toBeNull();
    expect(note?.problem).toBe(
      'Falta a forma de pagamento "Cartão de crédito Mastercard". Crie no seu Bling, escolha em Integrações › Bling e toque em Tentar de novo no pedido.',
    );
    expect(bling.state.created).toBeNull();
  });

  it("stops before creating anything when the card payment has no authorization code", async () => {
    const { shipmentId, sku } = await scenario(settingsWithCard);
    const bling = fakeBling(sku);
    const [card] = CARD_SALE.payments;
    if (card === undefined) {
      throw new Error("card payment missing");
    }
    const run = processor({
      ...bling,
      sale: { ...CARD_SALE, payments: [{ ...card, authorizationCode: null }] },
      sendSaleInvoice: async () => {},
      now: () => new Date(),
    });

    await run();

    expect((await noteOf(shipmentId))?.problem).toMatch(/código de autorização do cartão/);
    expect(bling.state.created).toBeNull();
  });

  it("stops without passing on a note its Bling issued under another company's CNPJ", async () => {
    const { shipmentId, tenantId, sku } = await scenario(settingsWithCard);
    await database
      .update(schema.tenantProfile)
      .set({ cnpj: "11222333000181" })
      .where(eq(schema.tenantProfile.tenantId, tenantId));
    const bling = fakeBling(sku);
    const sendSaleInvoice = vi.fn<ResellerSaleIssueDependencies["sendSaleInvoice"]>(async () => {});
    let clock = Date.now();
    const run = processor({
      ...bling,
      sale: CARD_SALE,
      sendSaleInvoice,
      now: () => new Date(clock),
    });

    await run();
    clock += 3_600_000;
    await run();

    const note = await noteOf(shipmentId);
    expect(sendSaleInvoice).not.toHaveBeenCalled();
    expect(note?.accessKey).toBeNull();
    expect(note?.problem).toMatch(/^A nota que saiu do seu Bling não serve\. .*45\.723\.174/);
  });

  it("stops before creating anything when the shop has no Mercado Livre account name", async () => {
    const { shipmentId, tenantId, sku } = await scenario(settingsWithCard);
    await nameShop(tenantId, " ");
    const bling = fakeBling(sku);
    const run = processor({
      ...bling,
      sale: CARD_SALE,
      sendSaleInvoice: async () => {},
      now: () => new Date(),
    });

    await run();

    expect((await noteOf(shipmentId))?.problem).toMatch(/nome da sua conta do Mercado Livre/);
    expect(bling.state.created).toBeNull();
  });

  it("stops instead of asking for the note by hand when the Bling that made it is gone", async () => {
    const { shipmentId, tenantId, sku } = await scenario(settingsWithCard);
    const bling = fakeBling(sku);
    let clock = Date.now();
    const run = processor({
      ...bling,
      sale: CARD_SALE,
      sendSaleInvoice: async () => {},
      now: () => new Date(clock),
    });
    await run();
    await database
      .delete(schema.resellerErpConnections)
      .where(eq(schema.resellerErpConnections.tenantId, tenantId));
    clock += 3_600_000;

    await run();

    const note = await noteOf(shipmentId);
    expect(note?.erpInvoiceId).toBe(9001);
    expect(note?.erpStoppedAt).not.toBeNull();
    expect(note?.problem).toBe("Conecte o Bling de novo em Integrações para continuar.");
  });
});
