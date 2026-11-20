import { z } from "zod";
import type { BlingCall } from "./invoices.ts";

/**
 * An NF-e made straight in Bling, without a sale order: the supplier's remessa of venda à ordem,
 * which moves the goods to the buyer but is no sale of the supplier, and the reseller's sale to
 * the buyer, issued by the reseller's own Bling. Fields follow the official OpenAPI
 * (developer.bling.com.br): `POST /nfe`, `GET /nfe` and `GET /nfe/{id}`.
 */

export interface BlingDirectInvoiceItem {
  readonly sku: string;
  readonly description: string;
  readonly unit: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  /** Eight digits. */
  readonly ncm: string;
  readonly origin: number;
  readonly cfop: string;
}

/** The NF-e this one cites (`documentoReferenciado`), such as the sale a remessa delivers. */
export interface BlingReferencedInvoice {
  readonly accessKey: string;
  readonly number: string | null;
  readonly series: string | null;
  /** The cited note's year and month, AAMM (positions 3–6 of its key). */
  readonly yearMonth: string;
}

export interface BlingNewDirectInvoice {
  readonly operationId: number;
  readonly contactId: number;
  /** When the goods leave, in Brazil: "YYYY-MM-DD HH:mm:ss". */
  readonly operationDate: string;
  readonly items: readonly BlingDirectInvoiceItem[];
  /** The note this one cites; null for a sale that cites none. */
  readonly referencedInvoice: BlingReferencedInvoice | null;
  readonly draftReference: string;
  /** Printed on the note; must name what makes it this order's (the marketplace order number). */
  readonly notes: string;
  /** The marketplace the sale went through (`intermediador`); left out when there is none. */
  readonly intermediary?: { readonly cnpj: string; readonly userName: string };
  /** How the buyer paid (`parcelas`); left out, Bling uses its default. */
  readonly installments?: readonly BlingInvoiceInstallment[];
}

/** One payment of the sale, with the account's payment method ("forma de pagamento"). */
export interface BlingInvoiceInstallment {
  /** The payment's day, YYYY-MM-DD. */
  readonly date: string;
  readonly amountCents: number;
  readonly paymentMethodId: number;
  /** A card payment's authorization code (`caut`, NT 2025.001); null for anything else. */
  readonly authorizationCode: string | null;
}

/** `tipo` 1: an outgoing note; `finalidade` 1: a normal one; `situacao` 1: not sent yet. */
const OUTGOING = 1;
const NORMAL = 1;
const PENDING = 1;
const NFE_MODEL = "55";
const PENDING_PAGE_LIMIT = 100;
const MAX_RECOVERY_PAGES = 10;

const operationListSchema = z.object({
  data: z.array(z.object({ id: z.number().int(), descricao: z.string() })),
});
/** `situacao` 1 lists the active entries only (operations, payment methods). */
const ACTIVE_ONLY = 1;
/** Accounts keep a handful of operations; one large page holds them all. */
const OPERATION_PAGE_LIMIT = 100;

const paymentMethodListSchema = z.object({
  data: z.array(
    z.object({ id: z.number().int(), descricao: z.string(), tipoPagamento: z.number().int() }),
  ),
});
const paymentMethodDetailSchema = z.object({
  data: z.object({
    dadosCartao: z.object({ bandeira: z.number().int().nullish() }).nullish(),
  }),
});
/** `tipoPagamento` 3 and 4: credit and debit card, whose brand only the detail read gives. */
const CARD_PAYMENT_TYPES = new Set([3, 4]);
/** Accounts keep a handful of payment methods; one large page holds them all. */
const PAYMENT_METHOD_PAGE_LIMIT = 100;

/** A payment method ("forma de pagamento") of the account, with its card brand code, if any. */
export interface BlingPaymentMethod {
  readonly id: number;
  readonly name: string;
  /** Bling's `tipoPagamento` (3 credit card, 4 debit card, 17 Pix…). */
  readonly type: number;
  /** Bling's `dadosCartao.bandeira` (1 Visa, 2 Mastercard…); null for anything else. */
  readonly cardBrand: number | null;
}

/** An operation ("natureza de operação") of the account, as Bling names it. */
export interface BlingOperation {
  readonly id: number;
  readonly name: string;
}

const idResponseSchema = z.object({ data: z.object({ id: z.number().int() }) });
const pendingListSchema = z.object({
  data: z.array(
    z.object({
      id: z.number().int(),
      contato: z.object({ id: z.number().int().nullish() }).nullish(),
      naturezaOperacao: z.object({ id: z.number().int().nullish() }).nullish(),
    }),
  ),
});
const invoiceItemsSchema = z.object({
  data: z.object({
    itens: z.array(z.object({ informacoesAdicionais: z.string().nullish() })).nullish(),
  }),
});

function priceInReais(cents: number): number {
  return cents / 100;
}

/** "64029990" as Bling writes NCM: "6402.99.90". */
function dottedNcm(ncm: string): string {
  const digits = ncm.replace(/\D/g, "");
  if (digits.length !== 8) {
    return ncm;
  }
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

function referencedInvoiceBody(cited: BlingReferencedInvoice | null) {
  if (cited === null) {
    return {};
  }
  return {
    documentoReferenciado: {
      modelo: NFE_MODEL,
      chaveAcesso: cited.accessKey,
      data: cited.yearMonth,
      ...(cited.number === null ? {} : { numero: cited.number }),
      ...(cited.series === null ? {} : { serie: cited.series }),
    },
  };
}

function saleChannelBody(invoice: BlingNewDirectInvoice) {
  const intermediary =
    invoice.intermediary === undefined
      ? {}
      : {
          intermediador: {
            cnpj: invoice.intermediary.cnpj,
            nomeUsuario: invoice.intermediary.userName,
          },
        };
  const installments =
    invoice.installments === undefined
      ? {}
      : {
          parcelas: invoice.installments.map((installment) => ({
            data: installment.date,
            valor: priceInReais(installment.amountCents),
            formaPagamento: { id: installment.paymentMethodId },
            ...(installment.authorizationCode === null
              ? {}
              : { caut: installment.authorizationCode }),
          })),
        };
  return { ...intermediary, ...installments };
}

function directInvoiceBody(invoice: BlingNewDirectInvoice) {
  return {
    tipo: OUTGOING,
    finalidade: NORMAL,
    dataOperacao: invoice.operationDate,
    contato: { id: invoice.contactId },
    naturezaOperacao: { id: invoice.operationId },
    ...referencedInvoiceBody(invoice.referencedInvoice),
    ...saleChannelBody(invoice),
    itens: invoice.items.map((item) => ({
      codigo: item.sku,
      descricao: item.description,
      unidade: item.unit,
      quantidade: item.quantity,
      valor: priceInReais(item.unitPriceCents),
      tipo: "P",
      classificacaoFiscal: dottedNcm(item.ncm),
      origem: item.origin,
      cfop: item.cfop,
      informacoesAdicionais: invoice.draftReference,
    })),
    observacoes: invoice.notes,
  };
}

function isCandidate(
  listed: z.infer<typeof pendingListSchema>["data"][number],
  input: { contactId: number; operationId: number },
): boolean {
  if (listed.contato?.id !== input.contactId) {
    return false;
  }
  // The list may leave the operation out; only a different one rules the note out.
  const operationId = listed.naturezaOperacao?.id;
  return operationId === null || operationId === undefined || operationId === input.operationId;
}

async function findMatchingDraft(
  call: BlingCall,
  notes: z.infer<typeof pendingListSchema>["data"],
  input: { contactId: number; operationId: number; draftReference: string },
): Promise<number | null> {
  for (const note of notes.filter((candidate) => isCandidate(candidate, input))) {
    const { data } = await call({ path: `/nfe/${note.id}`, schema: invoiceItemsSchema });
    if (data.itens?.some((item) => item.informacoesAdicionais === input.draftReference)) {
      return note.id;
    }
  }

  return null;
}

async function cardBrandOf(call: BlingCall, methodId: number): Promise<number | null> {
  const { data } = await call({
    path: `/formas-pagamentos/${methodId}`,
    schema: paymentMethodDetailSchema,
  });
  return data.dadosCartao?.bandeira ?? null;
}

/**
 * The account's active payment methods (`GET /formas-pagamentos`). The list leaves the card
 * brand out, so each card method is read once more (`GET /formas-pagamentos/{id}`).
 */
async function listPaymentMethods(call: BlingCall): Promise<BlingPaymentMethod[]> {
  const query = new URLSearchParams({
    situacao: String(ACTIVE_ONLY),
    limite: String(PAYMENT_METHOD_PAGE_LIMIT),
  });
  const response = await call({
    path: `/formas-pagamentos?${query.toString()}`,
    schema: paymentMethodListSchema,
  });
  const methods: BlingPaymentMethod[] = [];
  for (const method of response.data) {
    const cardBrand = CARD_PAYMENT_TYPES.has(method.tipoPagamento)
      ? await cardBrandOf(call, method.id)
      : null;
    methods.push({
      id: method.id,
      name: method.descricao.trim(),
      type: method.tipoPagamento,
      cardBrand,
    });
  }
  return methods;
}

export function blingDirectInvoiceCalls(call: BlingCall) {
  return {
    /** The account's active operations (`GET /naturezas-operacoes`), for the supplier to pick. */
    async listOperations(): Promise<BlingOperation[]> {
      const query = new URLSearchParams({
        situacao: String(ACTIVE_ONLY),
        limite: String(OPERATION_PAGE_LIMIT),
      });
      const response = await call({
        path: `/naturezas-operacoes?${query.toString()}`,
        schema: operationListSchema,
      });
      return response.data.map((operation) => ({
        id: operation.id,
        name: operation.descricao.trim(),
      }));
    },

    listPaymentMethods: async () => listPaymentMethods(call),

    /** Creates the NF-e (not sent yet) and returns its id. */
    async createDirectInvoice(invoice: BlingNewDirectInvoice): Promise<number> {
      const response = await call({
        path: "/nfe",
        init: { method: "POST", body: JSON.stringify(directInvoiceBody(invoice)) },
        schema: idResponseSchema,
      });
      return response.data.id;
    },

    /**
     * The note an earlier attempt made and did not get to save (its answer was lost): an outgoing
     * note still pending, to this contact, with this operation, issued since the creation attempt.
     * Bling returns item information on a detail read. The invoice observations are write-only.
     */
    async findPendingDirectInvoice(input: {
      contactId: number;
      operationId: number;
      /** "YYYY-MM-DD HH:mm:ss", in Brazil. */
      since: string;
      draftReference: string;
    }): Promise<number | null> {
      const query = new URLSearchParams({
        tipo: String(OUTGOING),
        situacao: String(PENDING),
        dataEmissaoInicial: input.since,
        limite: String(PENDING_PAGE_LIMIT),
      });
      for (let page = 1; page <= MAX_RECOVERY_PAGES; page += 1) {
        query.set("pagina", String(page));
        const response = await call({
          path: `/nfe?${query.toString()}`,
          schema: pendingListSchema,
        });
        const id = await findMatchingDraft(call, response.data, input);

        if (id !== null || response.data.length < PENDING_PAGE_LIMIT) {
          return id;
        }
      }

      return null;
    },
  };
}
