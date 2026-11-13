import { z } from "zod";
import type { ProductFiscal } from "./product-fiscal.ts";
import type { SupplierTaxDefaults } from "./supplier-fiscal.ts";

/**
 * The NF-e a supplier's ERP issues for one parcel (one order, one supplier). Every tax choice
 * comes from settings: the supplier's defaults and a product's own override. None is fixed in
 * code, so the accountant's answer is a change of setting (docs/DECISOES.md, 10/11/2026).
 */

/**
 * How the sale is invoiced ("Como sai a nota"):
 * - direct: one sale NF-e from the supplier straight to the marketplace buyer (model A);
 * - on_behalf: "venda à ordem", three notes with the reseller in the middle (model B, not built
 *   yet: the screen shows it as "em breve" and the job holds such parcels back).
 */
export const INVOICE_MODELS = ["direct", "on_behalf"] as const;
export type InvoiceModel = (typeof INVOICE_MODELS)[number];
export const invoiceModelSchema = z.enum(INVOICE_MODELS, "Escolha como sai a nota");

export const INVOICE_MODEL_LABELS: Readonly<Record<InvoiceModel, string>> = {
  direct: "Direto para o cliente",
  on_behalf: "Venda à ordem",
};

/** Models the job can issue today; the others are shown as coming soon. */
export const AVAILABLE_INVOICE_MODELS: readonly InvoiceModel[] = ["direct"];

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

interface CfopChoice {
  readonly product: ProductFiscal;
  readonly defaults: SupplierTaxDefaults;
  readonly inState: boolean;
  readonly recipientPaysIcms: boolean;
}

/**
 * In-state: the in-state CFOP (5102). Out of state: the company CFOP (6102) for a recipient with
 * a state registration, else the final-consumer CFOP (6108). A product's own in-state and company
 * codes beat the supplier's; the final-consumer code is the supplier's only.
 */
function chooseCfop(choice: CfopChoice): string {
  const { product, defaults } = choice;
  if (choice.inState) {
    return product.cfopInState ?? defaults.cfopInState;
  }
  if (choice.recipientPaysIcms) {
    return product.cfopOutOfState ?? defaults.cfopOutOfState;
  }
  return defaults.cfopOutOfStateConsumer;
}

/**
 * The line's tax data: the product's own value when it has one, else the supplier's default.
 *
 * @param input.recipientPaysIcms - Whether the buyer is a company with a state registration.
 * @throws {MissingInvoiceDataError} When the product has no NCM (there is no default for it).
 */
export function resolveInvoiceItemTax(input: {
  sku: string;
  product: ProductFiscal;
  defaults: SupplierTaxDefaults;
  supplierState: string;
  recipientState: string;
  recipientPaysIcms: boolean;
}): InvoiceItemTax {
  const { product, defaults } = input;
  if (product.ncm === null) {
    throw new MissingInvoiceDataError(input.sku);
  }
  const inState = input.supplierState.toUpperCase() === input.recipientState.toUpperCase();
  return {
    cfop: chooseCfop({ product, defaults, inState, recipientPaysIcms: input.recipientPaysIcms }),
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

const ACCESS_KEY_GROUP = 4;

/** "3126 1111 2223 …": the 44-digit access key in groups of four, as the DANFE prints it. */
export function formatAccessKey(accessKey: string): string {
  const digits = accessKey.replace(/\D/g, "");
  const groups: string[] = [];
  for (let start = 0; start < digits.length; start += ACCESS_KEY_GROUP) {
    groups.push(digits.slice(start, start + ACCESS_KEY_GROUP));
  }
  return groups.join(" ");
}

/** The note's two files: its XML and its DANFE (the printable PDF). */
export const INVOICE_FILE_KINDS = ["xml", "danfe"] as const;
export type InvoiceFileKind = (typeof INVOICE_FILE_KINDS)[number];

/** Bling's name for each file's format in `GET /nfe/documento/{chaveAcesso}`. */
export const INVOICE_FILE_FORMATS: Readonly<Record<InvoiceFileKind, "xml" | "pdf">> = {
  xml: "xml",
  danfe: "pdf",
};

export const INVOICE_FILE_CONTENT_TYPES: Readonly<Record<InvoiceFileKind, string>> = {
  xml: "application/xml",
  danfe: "application/pdf",
};

/**
 * "nfe-1234.xml" or "danfe-1234.pdf": named by the note's number, else by its access key. Only
 * letters, digits and hyphens get in, so the name is safe in a download header.
 */
export function invoiceFileName(
  invoice: { number: string | null; accessKey: string },
  kind: InvoiceFileKind,
): string {
  const number = (invoice.number ?? "").replace(/[^\dA-Za-z-]/g, "");
  const name = number === "" ? invoice.accessKey.replace(/\D/g, "") : number;
  return kind === "xml" ? `nfe-${name}.xml` : `danfe-${name}.pdf`;
}

/** Why a note must stop before its next step; each one has its own message for the supplier. */
export type InvoiceStopReason =
  "erp_disconnected" | "sale_not_going_ahead" | "emission_off" | "missing_lines";

/** What the job checks again on every run, since the note may have waited an hour for a retry. */
export interface InvoiceGuardInput {
  readonly status: InvoiceStatus;
  /** The supplier's ERP account is still linked and connected. */
  readonly erpConnected: boolean;
  /** Neither the order nor the parcel was cancelled, returned or left undelivered. */
  readonly saleGoesAhead: boolean;
  /** The supplier still has emission through the ERP turned on. */
  readonly emissionOn: boolean;
  /** Parcel items with no matching order line, which would leave the note incomplete. */
  readonly missingLines: number;
}

/**
 * Why the note must stop before its next step, or null when it may go on. A note already handed
 * to SEFAZ only needs the connection to read the answer; one not sent yet must still be for a
 * sale that goes ahead, with emission on and every item found.
 */
export function invoiceStopReason(input: InvoiceGuardInput): InvoiceStopReason | null {
  if (!input.erpConnected) {
    return "erp_disconnected";
  }
  if (input.status !== "queued") {
    return null;
  }
  if (!input.saleGoesAhead) {
    return "sale_not_going_ahead";
  }
  if (!input.emissionOn) {
    return "emission_off";
  }
  return input.missingLines > 0 ? "missing_lines" : null;
}
