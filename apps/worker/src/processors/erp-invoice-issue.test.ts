import { schema } from "@sellbridge/database";
import { queueNewShipmentInvoices, upsertErpConnection } from "@sellbridge/database/repositories";
import { createInvoiceScenario } from "@sellbridge/database/testing/shipment-invoice";
import type { BuyerBilling } from "@sellbridge/marketplaces";
import { createBlingRateLimiter } from "@sellbridge/marketplaces/bling";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerTestEnvironment } from "../testing/fixtures.ts";
import { createErpInvoiceProcessor } from "./erp-invoice-issue.ts";

const { database, cipher } = createWorkerTestEnvironment();
const credentials = { clientId: "id", clientSecret: "secret" };
const cleanups: (() => Promise<void>)[] = [];

const PERSON: BuyerBilling = {
  documentType: "CPF",
  document: "52998224725",
  name: "Maria Silva",
  stateRegistration: null,
};
const ACCESS_KEY = "31261111222333000181550010000012341000012345";
const DANFE_URL = "https://www.bling.com.br/doc.view.php?id=abc";

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

interface FakeBlingOptions {
  sku: string;
  /** The CFOP Bling's rules put on the generated note. */
  cfop?: string;
  /** Answers given once, before the normal one, keyed by "METHOD /path". */
  failOnce?: Record<string, Response>;
  /** The first "gerar-nfe" makes the note, but its answer is lost (Bling times out). */
  loseFirstGeneratedNote?: boolean;
}

/** A Bling account in SEFAZ homologation, faked over HTTP: no real call ever leaves the test. */
function fakeBling(options: FakeBlingOptions) {
  let sent = false;
  let generated = false;
  const failures = new Map(Object.entries(options.failOnce ?? {}));
  const routes: Record<string, () => Response> = {
    "GET /Api/v3/contatos": () => json(200, { data: [] }),
    "POST /Api/v3/contatos": () => json(201, { data: { id: 78 } }),
    "GET /Api/v3/pedidos/vendas": () => json(200, { data: [] }),
    "GET /Api/v3/produtos": () =>
      json(200, {
        data: [{ id: 10, nome: "Chinelo", codigo: options.sku, formato: "S", situacao: "A" }],
      }),
    "POST /Api/v3/pedidos/vendas": () => json(201, { data: { id: 500 } }),
    "GET /Api/v3/pedidos/vendas/500": () =>
      json(200, { data: { id: 500, notaFiscal: { id: generated ? 900 : 0 } } }),
    "POST /Api/v3/pedidos/vendas/500/gerar-nfe": () => {
      const answerLost = options.loseFirstGeneratedNote === true && !generated;
      generated = true;
      return answerLost
        ? json(504, { error: { type: "SERVER_ERROR", message: "timeout" } })
        : json(201, { data: { idNotaFiscal: 900 } });
    },
    "GET /Api/v3/nfe/900": () =>
      json(200, {
        data: sent
          ? {
              situacao: 5,
              numero: "1234",
              serie: 1,
              chaveAcesso: ACCESS_KEY,
              linkDanfe: DANFE_URL,
              itens: [{ codigo: options.sku, cfop: options.cfop ?? "6108" }],
            }
          : { situacao: 1, itens: [{ codigo: options.sku, cfop: options.cfop ?? "6108" }] },
      }),
    "POST /Api/v3/nfe/900/enviar": () => {
      sent = true;
      return json(200, { data: { xml: "<nfe/>" } });
    },
  };
  return vi.fn<typeof fetch>(async (input, init) => {
    const route = `${init?.method ?? "GET"} ${requestUrl(input).pathname}`;
    const failure = failures.get(route);
    if (failure !== undefined) {
      failures.delete(route);
      return failure;
    }
    const answer = routes[route];
    if (answer === undefined) {
      throw new Error(`Unexpected Bling call: ${route}`);
    }
    return answer();
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

async function scenario(options?: Parameters<typeof createInvoiceScenario>[1]) {
  const created = await createInvoiceScenario(database, options);
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
  return created;
}

function processor(
  fetchImplementation: typeof fetch,
  options: { billing?: BuyerBilling | null; now?: () => Date } = {},
) {
  return createErpInvoiceProcessor({
    database,
    cipher,
    blingCredentials: credentials,
    limiter: createBlingRateLimiter({ sleep: async () => {} }),
    fetchImplementation,
    readBuyerBilling: async () => (options.billing === undefined ? PERSON : options.billing),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

async function invoiceOf(shipmentId: string) {
  const [row] = await database
    .select()
    .from(schema.shipmentInvoices)
    .where(eq(schema.shipmentInvoices.shipmentId, shipmentId));
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

describe("erp invoice issue", () => {
  it("creates the sale order and the NF-e in Bling, sends it and stores the authorized note", async () => {
    const { shipmentId, sku, externalOrderId } = await scenario();
    const bling = fakeBling({ sku });

    await processor(bling)();
    const sent = await invoiceOf(shipmentId);
    await processor(bling, { now: minutesFromNow(3) })();

    expect(sent?.status).toBe("sent");
    expect(await invoiceOf(shipmentId)).toMatchObject({
      status: "authorized",
      number: "1234",
      series: "1",
      accessKey: ACCESS_KEY,
      danfeUrl: DANFE_URL,
      problem: null,
    });
    const [orderCall] = callsTo(bling, "POST /Api/v3/pedidos/vendas");
    expect(sentBody(orderCall)).toMatchObject({
      numeroLoja: externalOrderId,
      contato: { id: 78 },
      itens: [{ codigo: sku, produto: { id: 10 }, quantidade: 2, valor: 49.9, unidade: "PAR" }],
    });
    const [contactCall] = callsTo(bling, "POST /Api/v3/contatos");
    expect(sentBody(contactCall)).toMatchObject({
      tipo: "F",
      numeroDocumento: "52998224725",
      indicadorIe: 9,
      endereco: { geral: { uf: "SP", cep: "01001000" } },
    });
  });

  it("holds the note back when Bling's rules put another CFOP than the settings ask", async () => {
    const { shipmentId, sku } = await scenario();
    const bling = fakeBling({ sku, cfop: "6102" });

    await processor(bling)();

    const invoice = await invoiceOf(shipmentId);
    expect(invoice?.status).toBe("attention");
    expect(invoice?.problem).toContain("6108");
    expect(callsTo(bling, "POST /Api/v3/nfe/900/enviar")).toHaveLength(0);
  });

  it("goes on from the saved contact after Bling fails for a moment", async () => {
    const { shipmentId, sku } = await scenario();
    const bling = fakeBling({
      sku,
      failOnce: {
        "POST /Api/v3/pedidos/vendas": json(503, { error: { type: "SERVER_ERROR", message: "x" } }),
      },
    });

    await processor(bling)();
    const waiting = await invoiceOf(shipmentId);
    await processor(bling, { now: minutesFromNow(3) })();

    expect(waiting).toMatchObject({ status: "queued", attempts: 1, erpContactId: 78 });
    expect((await invoiceOf(shipmentId))?.status).toBe("sent");
    expect(callsTo(bling, "POST /Api/v3/contatos")).toHaveLength(1);
  });

  it("reuses the note Bling already made when the answer to gerar-nfe was lost", async () => {
    const { shipmentId, sku } = await scenario();
    const bling = fakeBling({ sku, loseFirstGeneratedNote: true });

    await processor(bling)();
    const waiting = await invoiceOf(shipmentId);
    await processor(bling, { now: minutesFromNow(3) })();

    expect(waiting).toMatchObject({ status: "queued", erpOrderId: 500, erpInvoiceId: null });
    expect(await invoiceOf(shipmentId)).toMatchObject({ status: "sent", erpInvoiceId: 900 });
    expect(callsTo(bling, "POST /Api/v3/pedidos/vendas/500/gerar-nfe")).toHaveLength(1);
  });

  it("stops with the buyer's missing document in the supplier's words", async () => {
    const { shipmentId, sku } = await scenario();

    await processor(fakeBling({ sku }), { billing: null })();

    const invoice = await invoiceOf(shipmentId);
    expect(invoice?.status).toBe("attention");
    expect(invoice?.problem).toContain("CPF ou CNPJ do comprador");
  });

  it("stops with Bling's own reason when it refuses the sale order", async () => {
    const { shipmentId, sku } = await scenario();
    const bling = fakeBling({
      sku,
      failOnce: {
        "POST /Api/v3/pedidos/vendas": json(400, {
          error: {
            type: "VALIDATION_ERROR",
            message: "Não foi possível salvar",
            fields: [{ code: 1, msg: "A natureza de operação não foi encontrada" }],
          },
        }),
      },
    });

    await processor(bling)();

    expect((await invoiceOf(shipmentId))?.problem).toBe(
      "O Bling recusou a nota: A natureza de operação não foi encontrada",
    );
  });

  it("stops a queued note without calling Bling when the order was cancelled meanwhile", async () => {
    const { shipmentId, sku } = await scenario();
    await queueNewShipmentInvoices(database);
    const [parcel] = await database
      .select({ orderId: schema.orderShipments.orderId })
      .from(schema.orderShipments)
      .where(eq(schema.orderShipments.id, shipmentId));
    await database
      .update(schema.orders)
      .set({ status: "cancelled" })
      .where(eq(schema.orders.id, parcel?.orderId ?? ""));
    const bling = fakeBling({ sku });

    await processor(bling)();

    const invoice = await invoiceOf(shipmentId);
    expect(invoice?.status).toBe("attention");
    expect(invoice?.problem).toContain("cancelado");
    expect(bling).not.toHaveBeenCalled();
  });

  it("stops before calling Bling when a product has no NCM", async () => {
    const { shipmentId, sku } = await scenario({ productFiscal: { origin: 0, unit: "PAR" } });
    const bling = fakeBling({ sku });

    await processor(bling)();

    expect((await invoiceOf(shipmentId))?.problem).toContain(`Falta o NCM do produto ${sku}`);
    expect(bling).not.toHaveBeenCalled();
  });

  it("uses the company CFOP for a buyer with a state registration", async () => {
    const { shipmentId, sku } = await scenario();
    const company: BuyerBilling = {
      documentType: "CNPJ",
      document: "45723174000110",
      name: "Loja Exemplo Ltda",
      stateRegistration: "30703088534",
    };

    await processor(fakeBling({ sku, cfop: "6102" }), { billing: company })();

    expect((await invoiceOf(shipmentId))?.status).toBe("sent");
  });
});
