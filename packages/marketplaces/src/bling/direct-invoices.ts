import { z } from "zod";
import type { BlingCall } from "./invoices.ts";

/**
 * An NF-e made straight in Bling, without a sale order: the remessa of venda à ordem, which moves
 * the goods to the buyer but is no sale of the supplier. Fields follow the official OpenAPI
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
  readonly referencedInvoice: BlingReferencedInvoice;
  /** Printed on the note; must name what makes it this order's (the marketplace order number). */
  readonly notes: string;
}

/** `tipo` 1: an outgoing note; `finalidade` 1: a normal one; `situacao` 1: not sent yet. */
const OUTGOING = 1;
const NORMAL = 1;
const PENDING = 1;
const NFE_MODEL = "55";
/** Pending notes of one recipient since the sale are few; one page is enough. */
const PENDING_PAGE_LIMIT = 100;

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
const invoiceNotesSchema = z.object({
  data: z.object({ observacoes: z.string().nullish() }),
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

function directInvoiceBody(invoice: BlingNewDirectInvoice) {
  const cited = invoice.referencedInvoice;
  return {
    tipo: OUTGOING,
    finalidade: NORMAL,
    dataOperacao: invoice.operationDate,
    contato: { id: invoice.contactId },
    naturezaOperacao: { id: invoice.operationId },
    documentoReferenciado: {
      modelo: NFE_MODEL,
      chaveAcesso: cited.accessKey,
      data: cited.yearMonth,
      ...(cited.number === null ? {} : { numero: cited.number }),
      ...(cited.series === null ? {} : { serie: cited.series }),
    },
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

export function blingDirectInvoiceCalls(call: BlingCall) {
  return {
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
     * note still pending, to this contact, with this operation, issued since `since`, whose notes
     * carry `marker`. Null when there is none. A note made without a sale order has no store
     * number to find it by, so the marker in its notes tells it apart from the buyer's others.
     */
    async findPendingDirectInvoice(input: {
      contactId: number;
      operationId: number;
      /** "YYYY-MM-DD HH:mm:ss", in Brazil. */
      since: string;
      marker: string;
    }): Promise<number | null> {
      const query = new URLSearchParams({
        tipo: String(OUTGOING),
        situacao: String(PENDING),
        dataEmissaoInicial: input.since,
        limite: String(PENDING_PAGE_LIMIT),
      });
      const response = await call({ path: `/nfe?${query.toString()}`, schema: pendingListSchema });
      for (const listed of response.data.filter((note) => isCandidate(note, input))) {
        const detail = await call({ path: `/nfe/${listed.id}`, schema: invoiceNotesSchema });
        if ((detail.data.observacoes ?? "").includes(input.marker)) {
          return listed.id;
        }
      }
      return null;
    },
  };
}
