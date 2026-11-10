import { z } from "zod";
import type { ProductFiscal } from "./product-fiscal.ts";
import type { SupplierTaxDefaults } from "./supplier-fiscal.ts";

/**
 * The NF-e a supplier's ERP issues for one parcel (one order, one supplier). Every tax choice
 * comes from settings: the supplier's defaults, a product's own override, and the connection's
 * choice of who the note is made out to. None is fixed in code, so the accountant's answer is a
 * change of setting.
 */

/** Who the NF-e is made out to: the marketplace buyer, or the reseller's company. */
export const INVOICE_RECIPIENTS = ["buyer", "reseller"] as const;
export type InvoiceRecipient = (typeof INVOICE_RECIPIENTS)[number];
export const invoiceRecipientSchema = z.enum(INVOICE_RECIPIENTS);

/**
 * - queued: waiting for the job (first try or a retry after a passing failure);
 * - sent: handed to SEFAZ, waiting for its answer;
 * - authorized: SEFAZ authorized it; number, key and DANFE are known;
 * - attention: stopped until someone acts; `problem` says what to do;
 * - cancelled: cancelled in the ERP (cancelling is done there, not here).
 */
export const INVOICE_STATUSES = ["queued", "sent", "authorized", "attention", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** The supplier's words for each status, the same on every screen. */
export const INVOICE_STATUS_LABELS: Readonly<Record<InvoiceStatus, string>> = {
  queued: "Nota sendo preparada",
  sent: "Aguardando a SEFAZ",
  authorized: "Nota emitida",
  attention: "Nota com problema",
  cancelled: "Nota cancelada",
};

/** The tax codes and product data that go on one line of the note. */
export interface InvoiceItemTax {
  readonly cfop: string;
  readonly icmsCode: string;
  readonly pisCofinsCst: string;
  readonly ncm: string;
  readonly origin: number;
  readonly unit: string;
  readonly cest: string | null;
}

export class MissingInvoiceDataError extends Error {
  readonly sku: string;
  constructor(sku: string) {
    super(`Product ${sku} has no NCM for the NF-e`);
    this.name = "MissingInvoiceDataError";
    this.sku = sku;
  }
}

/**
 * The line's tax data: the product's own value when it has one, else the supplier's default.
 * The CFOP is the in-state one when the supplier and the recipient are in the same state.
 *
 * @throws {MissingInvoiceDataError} When the product has no NCM (there is no default for it).
 */
export function resolveInvoiceItemTax(input: {
  sku: string;
  product: ProductFiscal;
  defaults: SupplierTaxDefaults;
  supplierState: string;
  recipientState: string;
}): InvoiceItemTax {
  const { product, defaults } = input;
  if (product.ncm === null) {
    throw new MissingInvoiceDataError(input.sku);
  }
  const inState = input.supplierState.toUpperCase() === input.recipientState.toUpperCase();
  const cfop = inState
    ? (product.cfopInState ?? defaults.cfopInState)
    : (product.cfopOutOfState ?? defaults.cfopOutOfState);
  return {
    cfop,
    icmsCode: product.icmsCode ?? defaults.icmsCode,
    pisCofinsCst: product.pisCofinsCst ?? defaults.pisCofinsCst,
    ncm: product.ncm,
    origin: product.origin ?? defaults.origin,
    unit: product.unit ?? defaults.unit,
    cest: product.cest,
  };
}

/** What the ERP's NF-e status (Bling's `situacao`) means here. */
export type ErpInvoiceOutcome = "authorized" | "waiting" | "refused" | "cancelled" | "editable";

/**
 * Bling's `situacao` of an NF-e (OpenAPI, `GET /nfe/{id}`): 1 pending (not sent yet), 2
 * cancelled, 3 waiting for the receipt, 4 rejected, 5 authorized, 6 DANFE issued, 7 registered,
 * 8 waiting for the protocol, 9 denied, 10 status being checked, 11 blocked.
 */
export function blingInvoiceOutcome(situacao: number): ErpInvoiceOutcome {
  if (situacao === 5 || situacao === 6) {
    return "authorized";
  }
  if (situacao === 2) {
    return "cancelled";
  }
  if (situacao === 1) {
    return "editable";
  }
  if (situacao === 4 || situacao === 9 || situacao === 11) {
    return "refused";
  }
  return "waiting";
}

/** Bling's words for a refused note's `situacao`, for the supplier's message. */
export function refusedInvoiceReason(situacao: number): string {
  if (situacao === 9) {
    return "A SEFAZ negou a nota (denegada). Fale com o seu contador antes de vender de novo para este cliente.";
  }
  if (situacao === 11) {
    return "O Bling bloqueou a nota. Abra a nota no Bling para ver o motivo.";
  }
  return "A SEFAZ rejeitou a nota. Abra a nota no Bling para ver o motivo, corrija e envie de novo por lá.";
}

/** Passing failures (ERP busy or offline) are tried again this many times before stopping. */
export const MAX_INVOICE_ATTEMPTS = 8;
const FIRST_RETRY_IN_MS = 2 * 60_000;
const LONGEST_RETRY_IN_MS = 60 * 60_000;
/** How long the job waits before asking SEFAZ's answer again. */
export const INVOICE_STATUS_CHECK_IN_MS = 2 * 60_000;

/**
 * When to try again after the `attempts`-th passing failure: 2 minutes, doubling, at most an hour.
 *
 * @throws {RangeError} When `attempts` is not a positive integer.
 */
export function nextInvoiceAttemptAt(attempts: number, now: Date): Date {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError(`Invoice attempts must be a positive integer, got ${attempts}`);
  }
  const delay = Math.min(FIRST_RETRY_IN_MS * 2 ** (attempts - 1), LONGEST_RETRY_IN_MS);
  return new Date(now.getTime() + delay);
}

/** One line of the note as the ERP built it, next to what the settings say it should carry. */
export interface InvoiceLineCheck {
  readonly sku: string;
  readonly expectedCfop: string;
  readonly actualCfop: string | null;
}

/**
 * Why the note the ERP built must not go to SEFAZ, or null when every line carries the CFOP the
 * settings ask for. The ERP fills the CFOP from its own rules (Bling's "natureza de operação"),
 * so a note that disagrees with the settings is held back instead of sent.
 */
export function invoiceCfopProblem(lines: readonly InvoiceLineCheck[]): string | null {
  const wrong = lines.find(
    (line) => line.actualCfop === null || line.actualCfop.trim() !== line.expectedCfop,
  );
  if (wrong === undefined) {
    return null;
  }
  const actual = wrong.actualCfop === null ? "sem CFOP" : `com CFOP ${wrong.actualCfop.trim()}`;
  return `O Bling montou a nota do produto ${wrong.sku} ${actual}, mas o cadastro fiscal pede ${wrong.expectedCfop}. Ajuste a natureza de operação no Bling ou o CFOP em Marca e tente de novo.`;
}
