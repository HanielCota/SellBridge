import { z } from "zod";

/**
 * The calls that turn a parcel into an NF-e in the supplier's Bling: the recipient as a contact,
 * the sale order, the note generated from it and its sending to SEFAZ. Fields follow the official
 * OpenAPI (developer.bling.com.br): `POST /contatos`, `GET` and `PUT /contatos/{id}`,
 * `POST /pedidos/vendas`, `GET /pedidos/vendas/{id}`, `POST /pedidos/vendas/{id}/gerar-nfe`,
 * `GET /nfe/{id}`, `POST /nfe/{id}/enviar`.
 */

/** Calls the API for one account with the client's limit, token and refresh. */
export type BlingCall = <Result>(request: {
  path: string;
  init?: RequestInit;
  schema: z.ZodType<Result>;
}) => Promise<Result>;

export interface BlingAddress {
  readonly street: string;
  readonly number: string;
  readonly complement: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  /** Digits only. */
  readonly postalCode: string;
}

/** Who the note is made out to; its address is where the parcel goes. */
export interface BlingNewContact {
  readonly name: string;
  readonly personType: "F" | "J";
  /** CPF or CNPJ, digits only. */
  readonly document: string;
  /** The company's state registration (an ICMS taxpayer); null for everyone else. */
  readonly stateRegistration: string | null;
  readonly address: BlingAddress;
}

export interface BlingSaleOrderItem {
  readonly sku: string;
  readonly productId: number;
  readonly description: string;
  readonly unit: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
}

export interface BlingNewSaleOrder {
  /** The marketplace order number, kept as `numeroLoja` to find the order again on a retry. */
  readonly storeOrderNumber: string;
  /** YYYY-MM-DD. */
  readonly date: string;
  readonly contact: { readonly id: number; readonly name: string };
  readonly items: readonly BlingSaleOrderItem[];
  readonly notes: string;
}

/** The note as Bling has it now. */
export interface BlingInvoice {
  readonly situacao: number;
  readonly number: string | null;
  readonly series: string | null;
  readonly accessKey: string | null;
  readonly danfeUrl: string | null;
  readonly lines: readonly { readonly sku: string; readonly cfop: string | null }[];
}

/** `situacao` "A": an active contact; `indicadorIe` 1: ICMS taxpayer, 9: not a taxpayer. */
const ACTIVE = "A";
const ICMS_TAXPAYER = 1;
const NOT_ICMS_TAXPAYER = 9;

const idResponseSchema = z.object({ data: z.object({ id: z.number().int() }) });
const listedIdsSchema = z.object({ data: z.array(z.object({ id: z.number().int() })) });
/** The contact as Bling has it; unknown fields are kept so an update sends them back as they are. */
const contactResponseSchema = z.object({
  data: z.looseObject({
    endereco: z.looseObject({ geral: z.record(z.string(), z.unknown()).nullish() }).nullish(),
  }),
});
const saleOrderInvoiceSchema = z.object({
  data: z.object({ notaFiscal: z.object({ id: z.number().int() }).nullish() }),
});
const generatedInvoiceSchema = z.object({ data: z.object({ idNotaFiscal: z.number().int() }) });
const sentInvoiceSchema = z.object({ data: z.object({ xml: z.string().nullish() }).nullish() });

const invoiceResponseSchema = z.object({
  data: z.object({
    situacao: z.number().int(),
    numero: z.string().nullish(),
    serie: z.union([z.number(), z.string()]).nullish(),
    chaveAcesso: z.string().nullish(),
    linkDanfe: z.string().nullish(),
    linkPDF: z.string().nullish(),
    itens: z
      .array(
        z.object({
          codigo: z.string(),
          cfop: z.union([z.string(), z.number()]).nullish(),
        }),
      )
      .nullish(),
  }),
});

function blingAddress(address: BlingAddress) {
  return {
    endereco: address.street,
    numero: address.number,
    complemento: address.complement,
    bairro: address.neighborhood,
    municipio: address.city,
    uf: address.state,
    cep: address.postalCode,
  };
}

function comparableAddressPart(key: string, value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return key === "cep" ? text.replace(/\D/g, "") : text;
}

function isSameAddress(
  current: Readonly<Record<string, unknown>> | null | undefined,
  wanted: ReturnType<typeof blingAddress>,
): boolean {
  if (current === null || current === undefined) {
    return false;
  }
  return Object.entries(wanted).every(
    ([key, value]) =>
      comparableAddressPart(key, current[key]) === comparableAddressPart(key, value),
  );
}

function priceInReais(cents: number): number {
  return cents / 100;
}

function contactBody(contact: BlingNewContact) {
  return {
    nome: contact.name,
    situacao: ACTIVE,
    tipo: contact.personType,
    numeroDocumento: contact.document,
    ...(contact.stateRegistration === null
      ? { indicadorIe: NOT_ICMS_TAXPAYER }
      : { indicadorIe: ICMS_TAXPAYER, ie: contact.stateRegistration }),
    endereco: { geral: blingAddress(contact.address) },
  };
}

/**
 * No delivery place (`transporte.etiqueta`): the note goes straight to the buyer, whose address
 * is the contact's (decision of 10/11/2026, model A).
 */
function saleOrderBody(order: BlingNewSaleOrder) {
  return {
    numeroLoja: order.storeOrderNumber,
    data: order.date,
    dataSaida: order.date,
    dataPrevista: order.date,
    contato: { id: order.contact.id, nome: order.contact.name },
    itens: order.items.map((item) => ({
      codigo: item.sku,
      unidade: item.unit,
      quantidade: item.quantity,
      valor: priceInReais(item.unitPriceCents),
      descricao: item.description,
      produto: { id: item.productId },
    })),
    observacoes: order.notes,
  };
}

/** A link only when it is a web address; anything else is not shown to the supplier. */
function webLink(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

function presentText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

function contactCalls(call: BlingCall) {
  return {
    /** The contact with this CPF or CNPJ, or null when Bling has none. */
    async findContactByDocument(document: string): Promise<number | null> {
      const query = new URLSearchParams({ numeroDocumento: document, limite: "1" });
      const response = await call({
        path: `/contatos?${query.toString()}`,
        schema: listedIdsSchema,
      });
      return response.data[0]?.id ?? null;
    },

    /**
     * Puts this address on a contact Bling already has (a returning buyer may have moved), so
     * the note goes where this parcel goes. The contact's other data is sent back unchanged.
     */
    async updateContactAddress(contactId: number, address: BlingAddress): Promise<void> {
      const { data: contact } = await call({
        path: `/contatos/${contactId}`,
        schema: contactResponseSchema,
      });
      const wanted = blingAddress(address);
      if (isSameAddress(contact.endereco?.geral, wanted)) {
        return;
      }
      const updated = {
        ...contact,
        endereco: { ...contact.endereco, geral: { ...contact.endereco?.geral, ...wanted } },
      };
      await call({
        path: `/contatos/${contactId}`,
        init: { method: "PUT", body: JSON.stringify(updated) },
        schema: z.unknown(),
      });
    },

    async createContact(contact: BlingNewContact): Promise<number> {
      const response = await call({
        path: "/contatos",
        init: { method: "POST", body: JSON.stringify(contactBody(contact)) },
        schema: idResponseSchema,
      });
      return response.data.id;
    },
  };
}

function saleOrderCalls(call: BlingCall) {
  return {
    /** The sale order an earlier attempt created for this marketplace order, or null. */
    async findSaleOrderByStoreNumber(storeOrderNumber: string): Promise<number | null> {
      const query = new URLSearchParams({ limite: "1" });
      query.append("numerosLojas[]", storeOrderNumber);
      const response = await call({
        path: `/pedidos/vendas?${query.toString()}`,
        schema: listedIdsSchema,
      });
      return response.data[0]?.id ?? null;
    },

    /** The NF-e already generated from this sale order, or null while it has none (id 0). */
    async findSaleOrderInvoice(saleOrderId: number): Promise<number | null> {
      const response = await call({
        path: `/pedidos/vendas/${saleOrderId}`,
        schema: saleOrderInvoiceSchema,
      });
      const invoiceId = response.data.notaFiscal?.id ?? 0;
      return invoiceId > 0 ? invoiceId : null;
    },

    async createSaleOrder(order: BlingNewSaleOrder): Promise<number> {
      const response = await call({
        path: "/pedidos/vendas",
        init: { method: "POST", body: JSON.stringify(saleOrderBody(order)) },
        schema: idResponseSchema,
      });
      return response.data.id;
    },
  };
}

function noteCalls(call: BlingCall) {
  return {
    /** Generates the NF-e from the sale order (not sent yet); returns the note's id. */
    async generateInvoice(saleOrderId: number): Promise<number> {
      const response = await call({
        path: `/pedidos/vendas/${saleOrderId}/gerar-nfe`,
        init: { method: "POST" },
        schema: generatedInvoiceSchema,
      });
      return response.data.idNotaFiscal;
    },

    async getInvoice(invoiceId: number): Promise<BlingInvoice> {
      const response = await call({ path: `/nfe/${invoiceId}`, schema: invoiceResponseSchema });
      const invoice = response.data;
      return {
        situacao: invoice.situacao,
        number: presentText(invoice.numero),
        series: presentText(invoice.serie),
        accessKey: presentText(invoice.chaveAcesso),
        danfeUrl: webLink(invoice.linkDanfe) ?? webLink(invoice.linkPDF),
        lines: (invoice.itens ?? []).map((line) => ({
          sku: line.codigo,
          cfop: presentText(line.cfop),
        })),
      };
    },

    /** Sends the note to SEFAZ; Bling does not e-mail it (the supplier ships the DANFE). */
    async sendInvoice(invoiceId: number): Promise<void> {
      const query = new URLSearchParams({ enviarEmail: "false" });
      await call({
        path: `/nfe/${invoiceId}/enviar?${query.toString()}`,
        init: { method: "POST" },
        schema: sentInvoiceSchema,
      });
    },
  };
}

export function blingInvoiceCalls(call: BlingCall) {
  return { ...contactCalls(call), ...saleOrderCalls(call), ...noteCalls(call) };
}
