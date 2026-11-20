import { schema } from "@sellbridge/database";
import { setOnBehalfOperations, upsertErpConnection } from "@sellbridge/database/repositories";
import {
  createInvoiceScenario,
  TEST_SUPPLIER_FISCAL,
} from "@sellbridge/database/testing/shipment-invoice";
import type { BuyerBilling } from "@sellbridge/marketplaces";
import { createBlingRateLimiter } from "@sellbridge/marketplaces/bling";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerTestEnvironment } from "../testing/fixtures.ts";
import { createErpInvoiceProcessor } from "./erp-invoice-issue.ts";

// Venda à ordem: after the reseller's own sale note, the supplier's remessa and sale notes.
const { database, cipher } = createWorkerTestEnvironment();
const credentials = { clientId: "id", clientSecret: "secret" };
const cleanups: (() => Promise<void>)[] = [];

const PERSON: BuyerBilling = {
  documentType: "CPF",
  document: "52998224725",
  name: "Maria Silva",
  stateRegistration: null,
};
/** The reseller's sale note: CNPJ 45.723.174/0001-10 (the scenario's reseller), number 77. */
const RESELLER_KEY = "35261145723174000110550010000000771000000770";
const REMESSA_KEY = "31261111222333000181550010000012341000012345";
const SALE_KEY = "31261111222333000181550010000012351000012350";
const SHIPMENT_OPERATION = 41;
const SALE_OPERATION = 42;
const BUYER_CONTACT = 78;
const RESELLER_CONTACT = 79;

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

interface FakeNote {
  sent: boolean;
  readonly cfop: string;
  readonly number: string;
  readonly accessKey: string;
  draftReference: string;
}

interface FakeBlingOptions {
  sku: string;
  /** The first POST /nfe makes the note, but its answer is lost (Bling times out). */
  loseFirstRemessaAnswer?: boolean;
  hideRemessaAfterTimeout?: boolean;
}

function noteAnswer(note: FakeNote, sku: string) {
  const itens = [{ codigo: sku, cfop: note.cfop, informacoesAdicionais: note.draftReference }];
  if (!note.sent) {
    return { situacao: 1, itens };
  }
  return { situacao: 5, numero: note.number, serie: 1, chaveAcesso: note.accessKey, itens };
}

/** A supplier's Bling account in SEFAZ homologation, faked over HTTP. */
function fakeBling(options: FakeBlingOptions) {
  const remessa: FakeNote = {
    sent: false,
    cfop: "6923",
    number: "1234",
    accessKey: REMESSA_KEY,
    draftReference: "",
  };
  const sale: FakeNote = {
    sent: false,
    cfop: "5119",
    number: "1235",
    accessKey: SALE_KEY,
    draftReference: "",
  };
  let remessaMade = false;
  let saleMade = false;
  const routes: Record<string, (url: URL, body: unknown) => Response> = {
    "GET /Api/v3/contatos": () => json(200, { data: [] }),
    "POST /Api/v3/contatos": (_url, body) => {
      const isReseller = Reflect.get(Object(body), "tipo") === "J";
      return json(201, { data: { id: isReseller ? RESELLER_CONTACT : BUYER_CONTACT } });
    },
    "GET /Api/v3/nfe": () =>
      json(200, {
        data:
          remessaMade && options.hideRemessaAfterTimeout !== true
            ? [
                {
                  id: 901,
                  contato: { id: BUYER_CONTACT },
                  naturezaOperacao: { id: SHIPMENT_OPERATION },
                },
              ]
            : [],
      }),
    "POST /Api/v3/nfe": (_url, body) => {
      const answerLost = options.loseFirstRemessaAnswer === true && !remessaMade;
      remessaMade = true;
      const items: unknown = Reflect.get(Object(body), "itens");
      if (Array.isArray(items) && items.length > 0) {
        remessa.draftReference = String(Reflect.get(Object(items[0]), "informacoesAdicionais"));
      }

      return answerLost
        ? json(504, { error: { type: "SERVER_ERROR", message: "timeout" } })
        : json(201, { data: { id: 901 } });
    },
    "GET /Api/v3/nfe/901": () => json(200, { data: noteAnswer(remessa, options.sku) }),
    "POST /Api/v3/nfe/901/enviar": () => {
      remessa.sent = true;
      return json(200, { data: { xml: "<nfe/>" } });
    },
    "GET /Api/v3/produtos": () =>
      json(200, {
        data: [{ id: 10, nome: "Chinelo", codigo: options.sku, formato: "S", situacao: "A" }],
      }),
    "GET /Api/v3/pedidos/vendas": () => json(200, { data: [] }),
    "POST /Api/v3/pedidos/vendas": () => json(201, { data: { id: 500 } }),
    "GET /Api/v3/pedidos/vendas/500": () =>
      json(200, { data: { id: 500, notaFiscal: { id: saleMade ? 902 : 0 } } }),
    "POST /Api/v3/pedidos/vendas/500/gerar-nfe": () => {
      saleMade = true;
      return json(201, { data: { idNotaFiscal: 902 } });
    },
    "GET /Api/v3/nfe/902": () => json(200, { data: noteAnswer(sale, options.sku) }),
    "POST /Api/v3/nfe/902/enviar": () => {
      sale.sent = true;
      return json(200, { data: { xml: "<nfe/>" } });
    },
  };
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = requestUrl(input);
    const route = `${init?.method ?? "GET"} ${url.pathname}`;
    const answer = routes[route];
    if (answer === undefined) {
      throw new Error(`Unexpected Bling call: ${route}`);
    }
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    return answer(url, body);
  });
}

function callsTo(fetchImplementation: ReturnType<typeof fakeBling>, route: string) {
  return fetchImplementation.mock.calls.filter(
    ([input, init]) => `${init?.method ?? "GET"} ${requestUrl(input).pathname}` === route,
  );
}

function sentBody(call: Parameters<typeof fetch> | undefined): unknown {
  const body = call?.[1]?.body;
  return typeof body === "string" ? JSON.parse(body) : null;
}

/** A parcel of a supplier in venda à ordem whose reseller's sale note was already found. */
async function scenario(options: { operations?: boolean } = {}) {
  const created = await createInvoiceScenario(database, {
    supplierFiscal: { ...TEST_SUPPLIER_FISCAL, invoiceModel: "on_behalf" },
  });
  cleanups.push(created.cleanup);
  await upsertErpConnection(database, {
    supplierId: created.supplierId,
    provider: "bling",
    userId: null,
    tokens: {
      accessTokenEnc: cipher.encrypt("access"),
      refreshTokenEnc: cipher.encrypt("refresh"),
      expiresAt: new Date(Date.now() + 6 * 3600_000),
    },
  });
  if (options.operations !== false) {
    await setOnBehalfOperations(database, {
      supplierId: created.supplierId,
      shipmentOperationId: SHIPMENT_OPERATION,
      saleOperationId: SALE_OPERATION,
    });
  }
  await database.insert(schema.shipmentResellerInvoices).values({
    shipmentId: created.shipmentId,
    tenantId: created.tenantId,
    accessKey: RESELLER_KEY,
    number: "77",
    series: "1",
    source: "typed",
    foundAt: new Date(),
  });
  return created;
}

function processor(fetchImplementation: typeof fetch, options: { now?: () => Date } = {}) {
  return createErpInvoiceProcessor({
    database,
    cipher,
    blingCredentials: credentials,
    limiter: createBlingRateLimiter({ sleep: async () => {} }),
    fetchImplementation,
    readBuyerBilling: async () => PERSON,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

async function noteOf(
  shipmentId: string,
  kind: "direct" | "on_behalf_shipment" | "on_behalf_sale",
) {
  const [row] = await database
    .select()
    .from(schema.shipmentInvoices)
    .where(
      and(
        eq(schema.shipmentInvoices.shipmentId, shipmentId),
        eq(schema.shipmentInvoices.kind, kind),
      ),
    );
  return row;
}

function minutesFromNow(minutes: number): () => Date {
  return () => new Date(Date.now() + minutes * 60_000);
}

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

afterAll(async () => {
  await database.$client.end();
});

describe("venda à ordem notes", () => {
  it("issues the remessa citing the reseller's note, then the sale citing the remessa", async () => {
    const { shipmentId, sku, externalOrderId } = await scenario();
    const bling = fakeBling({ sku });

    await processor(bling)();
    await processor(bling, { now: minutesFromNow(3) })();
    await processor(bling, { now: minutesFromNow(6) })();
    await processor(bling, { now: minutesFromNow(9) })();

    expect(await noteOf(shipmentId, "direct")).toBeUndefined();
    expect(await noteOf(shipmentId, "on_behalf_shipment")).toMatchObject({
      status: "authorized",
      accessKey: REMESSA_KEY,
    });
    expect(await noteOf(shipmentId, "on_behalf_sale")).toMatchObject({
      status: "authorized",
      accessKey: SALE_KEY,
      erpContactId: RESELLER_CONTACT,
    });
    const [remessaCall] = callsTo(bling, "POST /Api/v3/nfe");
    expect(sentBody(remessaCall)).toMatchObject({
      tipo: 1,
      contato: { id: BUYER_CONTACT },
      naturezaOperacao: { id: SHIPMENT_OPERATION },
      documentoReferenciado: {
        modelo: "55",
        chaveAcesso: RESELLER_KEY,
        numero: "77",
        data: "2611",
      },
      itens: [
        { codigo: sku, quantidade: 2, valor: 20, cfop: "6923", classificacaoFiscal: "6402.99.90" },
      ],
    });
    expect(String(Reflect.get(Object(sentBody(remessaCall)), "observacoes"))).toContain(
      "CNPJ 45.723.174/0001-10",
    );
    const [saleCall] = callsTo(bling, "POST /Api/v3/pedidos/vendas");
    expect(sentBody(saleCall)).toMatchObject({
      numeroLoja: externalOrderId,
      contato: { id: RESELLER_CONTACT, nome: "Revenda Teste Ltda" },
      itens: [{ codigo: sku, valor: 20, naturezaOperacao: { id: SALE_OPERATION } }],
    });
    expect(String(Reflect.get(Object(sentBody(saleCall)), "observacoes"))).toContain(REMESSA_KEY);
    const [resellerContact] = callsTo(bling, "POST /Api/v3/contatos").filter(
      (call) => Reflect.get(Object(sentBody(call)), "tipo") === "J",
    );
    expect(sentBody(resellerContact)).toMatchObject({
      numeroDocumento: "45723174000110",
      endereco: { geral: { uf: "MG", cep: "30130010" } },
    });
  });

  it("waits for the remessa's authorization before the sale to the reseller", async () => {
    const { shipmentId, sku } = await scenario();
    const bling = fakeBling({ sku });

    await processor(bling)();

    expect((await noteOf(shipmentId, "on_behalf_shipment"))?.status).toBe("sent");
    expect(await noteOf(shipmentId, "on_behalf_sale")).toBeUndefined();
  });

  it("stops the remessa until the supplier chooses its operations in Bling", async () => {
    const { shipmentId, sku } = await scenario({ operations: false });
    const bling = fakeBling({ sku });

    await processor(bling)();

    expect(await noteOf(shipmentId, "on_behalf_shipment")).toMatchObject({
      status: "attention",
      problem: expect.stringContaining("naturezas de operação da venda à ordem"),
    });
    expect(callsTo(bling, "POST /Api/v3/nfe")).toHaveLength(0);
  });

  it("finds the remessa an attempt made when Bling's answer was lost", async () => {
    const { shipmentId, sku } = await scenario();
    const bling = fakeBling({ sku, loseFirstRemessaAnswer: true });

    await processor(bling)();
    const waiting = await noteOf(shipmentId, "on_behalf_shipment");
    await processor(bling, { now: minutesFromNow(3) })();

    expect(waiting).toMatchObject({ status: "queued", erpInvoiceId: null, attempts: 1 });
    expect(await noteOf(shipmentId, "on_behalf_shipment")).toMatchObject({
      status: "sent",
      erpInvoiceId: 901,
    });
    expect(callsTo(bling, "POST /Api/v3/nfe")).toHaveLength(1);
  });

  it("does not post a second remessa when a lost draft cannot be found", async () => {
    const { shipmentId, sku } = await scenario();
    const bling = fakeBling({ sku, loseFirstRemessaAnswer: true, hideRemessaAfterTimeout: true });

    await processor(bling)();
    await processor(bling, { now: minutesFromNow(3) })();

    expect(await noteOf(shipmentId, "on_behalf_shipment")).toMatchObject({
      status: "attention",
      problem: expect.stringContaining("não confirmou a criação da remessa"),
    });
    expect(callsTo(bling, "POST /Api/v3/nfe")).toHaveLength(1);
  });

  it("keeps an authorized remessa from triggering a sale in a reconnected account", async () => {
    const { shipmentId, supplierId, sku } = await scenario();
    const bling = fakeBling({ sku });

    await processor(bling)();
    await processor(bling, { now: minutesFromNow(3) })();
    await upsertErpConnection(database, {
      supplierId,
      provider: "bling",
      userId: null,
      tokens: {
        accessTokenEnc: cipher.encrypt("different-account-access"),
        refreshTokenEnc: cipher.encrypt("different-account-refresh"),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const [connection] = await database
      .select()
      .from(schema.supplierErpConnections)
      .where(eq(schema.supplierErpConnections.supplierId, supplierId));

    await processor(bling, { now: minutesFromNow(6) })();

    expect(connection).toMatchObject({
      onBehalfShipmentOperationId: null,
      onBehalfSaleOperationId: null,
    });
    expect(await noteOf(shipmentId, "on_behalf_sale")).toMatchObject({
      status: "attention",
      problem: expect.stringContaining("conexão do Bling mudou"),
    });
    expect(callsTo(bling, "POST /Api/v3/pedidos/vendas")).toHaveLength(0);
  });

  it("issues no supplier note while the reseller's sale note is missing", async () => {
    const created = await createInvoiceScenario(database, {
      supplierFiscal: { ...TEST_SUPPLIER_FISCAL, invoiceModel: "on_behalf" },
    });
    cleanups.push(created.cleanup);
    await database.insert(schema.shipmentResellerInvoices).values({
      shipmentId: created.shipmentId,
      tenantId: created.tenantId,
    });
    const bling = fakeBling({ sku: created.sku });

    await processor(bling)();

    const notes = await database
      .select({ kind: schema.shipmentInvoices.kind })
      .from(schema.shipmentInvoices)
      .where(eq(schema.shipmentInvoices.shipmentId, created.shipmentId));
    expect(notes).toEqual([]);
  });
});
