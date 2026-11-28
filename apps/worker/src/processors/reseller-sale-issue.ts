import type { Database } from "@sellbridge/database";
import {
  claimResellerSaleDraft,
  loadResellerSaleIssueWork,
  recordErpResellerSaleInvoice,
  recordMarketplaceResellerSaleInvoice,
  recordResellerSaleIssueProgress,
  scheduleResellerSaleInvoiceCheck,
  stopResellerSaleIssue,
  type DueResellerSaleInvoice,
  type ResellerSaleIssueWork,
} from "@sellbridge/database/repositories";
import {
  isMarketplaceError,
  isRetryableError,
  marketplaceError,
  SHOPEE_INVOICE_DELAY_IN_MS,
  type BuyerBilling,
  type MercadoLivreApprovedPayment,
  type MercadoLivreSalePayments,
} from "@sellbridge/marketplaces";
import type {
  BlingClient,
  BlingDirectInvoiceItem,
  BlingInvoice,
  BlingInvoiceInstallment,
  BlingNewDirectInvoice,
} from "@sellbridge/marketplaces/bling";
import { FEE_CHANNEL_NAMES, feeChannelOf } from "@sellbridge/shared/channel-fees";
import { parseAccessKey, resellerAccessKeyProblem } from "@sellbridge/shared/nfe-access-key";
import { readAuthorizedNfeXml } from "@sellbridge/shared/nfe-xml";
import {
  allocateInstallments,
  isCardSlot,
  paymentMethodFor,
  resellerSaleCfop,
  SHOPEE_INTERMEDIARY_CNPJ,
  type ResellerBlingSettings,
} from "@sellbridge/shared/reseller-bling";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  nextResellerInvoiceCheckAt,
  type MarketplaceSaleInvoice,
} from "@sellbridge/shared/reseller-invoice";
import {
  blingInvoiceOutcome,
  MAX_INVOICE_ATTEMPTS,
  refusedInvoiceReason,
} from "@sellbridge/shared/supplier-invoice";
import { brazilDateTime } from "./erp-invoice-on-behalf.ts";
import { brazilDay, InvoiceStopError } from "./erp-invoice-steps.ts";

/**
 * The reseller's own sale NF-e of venda à ordem (note 1), issued by the reseller's Bling: made
 * straight in Bling with the marketplace as intermediary and the order's payments, sent to SEFAZ,
 * and, once authorized, its XML passed on to the marketplace (decision of 20/11/2026; Mercado
 * Livre first, Shopee since 28/11/2026).
 */

export interface ResellerSaleIssueDependencies {
  readonly database: Database;
  /** The reseller's own Bling; null while the app's Bling keys are not set. */
  readonly clientFor: (tenantId: string) => BlingClient | null;
  readonly readBuyerBilling: (work: ResellerSaleIssueWork) => Promise<BuyerBilling | null>;
  readonly readSalePayments: (work: ResellerSaleIssueWork) => Promise<MercadoLivreSalePayments>;
  readonly sendSaleInvoice: (
    work: ResellerSaleIssueWork,
    note: { accessKey: string; xml: string },
  ) => Promise<void>;
  /**
   * The note already attached to the marketplace's order (the reseller attached it by hand), read
   * before a new one is made in Bling; absent where the marketplace does not tell.
   */
  readonly readAttachedInvoice?: (
    work: ResellerSaleIssueWork,
  ) => Promise<MarketplaceSaleInvoice | null>;
}

/** Where the note stands after one step. */
export type ResellerSaleIssueStep = "issued" | "waiting";

const NO_OPERATION =
  "Escolha em Integrações › Bling a natureza de operação da venda e peça para tentar de novo.";
const NO_COMPANY_ADDRESS =
  "Cadastre o endereço da sua empresa em Meu cadastro: a nota de venda sai com ele. Depois peça para tentar de novo.";
const NO_LINES = "Este pedido não tem itens para a nota.";
function isShopee(work: ResellerSaleIssueWork): boolean {
  return feeChannelOf(work.store.marketplace) === "shopee";
}

/** "O Mercado Livre", "A Shopee": the marketplace as a sentence starts with it. */
function marketplaceSubject(work: ResellerSaleIssueWork): string {
  const name = FEE_CHANNEL_NAMES[feeChannelOf(work.store.marketplace)];
  return isShopee(work) ? `A ${name}` : `O ${name}`;
}

/** "no Mercado Livre", "na Shopee". */
function marketplaceIn(work: ResellerSaleIssueWork): string {
  const name = FEE_CHANNEL_NAMES[feeChannelOf(work.store.marketplace)];
  return isShopee(work) ? `na ${name}` : `no ${name}`;
}

function noBuyerDocument(work: ResellerSaleIssueWork): string {
  return `${marketplaceSubject(work)} não informou o CPF ou CNPJ do comprador. Emita esta nota no seu sistema e envie o XML.`;
}

function noApprovedPayment(work: ResellerSaleIssueWork): string {
  return `${marketplaceSubject(work)} não mostra pagamento aprovado neste pedido. Emita esta nota no seu sistema e envie o XML.`;
}

function noCardAuthorization(work: ResellerSaleIssueWork): string {
  return `${marketplaceSubject(work)} não informou o código de autorização do cartão deste pedido, que a nota precisa. Emita esta nota no seu sistema e envie o XML.`;
}
const DRAFT_NOT_CONFIRMED =
  "O seu Bling não confirmou a criação da nota. Confira se ela existe no Bling antes de pedir para tentar de novo.";
const STUCK_IN_BLING =
  "A nota ficou no seu Bling sem ir para a SEFAZ. Abra a nota no Bling e envie por lá, ou envie aqui o XML dela.";
const CANCELLED_IN_BLING =
  "A nota foi cancelada no seu Bling. Emita outra no seu sistema e envie o XML aqui.";
const WRONG_XML =
  "O Bling entregou um XML que não é o desta nota. Baixe o XML no Bling e envie aqui.";
const NO_BLING = "Conecte o Bling de novo em Integrações para continuar.";
const WRONG_ATTACHED_KEY = "A chave de acesso dela não é válida.";
const DRAFT_TAKEN = "Outra rodada já está criando esta nota no Bling.";
/** NT 2020.006: idCadIntTran, the seller's account at the intermediary, takes 2 to 60 characters. */
const SELLER_ACCOUNT_LENGTH = { min: 2, max: 60 } as const;

/** The reseller's account on the marketplace: Bling's `nomeUsuario`, the NF-e's `idCadIntTran`. */
function sellerAccountOf(work: ResellerSaleIssueWork): string {
  const account = work.store.shopName.trim();
  if (account.length < SELLER_ACCOUNT_LENGTH.min || account.length > SELLER_ACCOUNT_LENGTH.max) {
    throw new InvoiceStopError(
      `Falta o nome da sua loja ${marketplaceIn(work)}, que vai na nota. Conecte a loja de novo em Lojas e peça para tentar de novo.`,
    );
  }
  return account;
}

/**
 * The marketplace's CNPJ as the sale's intermediary. Mercado Livre's comes from the settings the
 * reseller's accountant may change; Shopee's is fixed.
 */
function intermediaryCnpjOf(work: ResellerSaleIssueWork, settings: ResellerBlingSettings): string {
  return isShopee(work) ? SHOPEE_INTERMEDIARY_CNPJ : settings.intermediaryCnpj;
}

/** How long after authorization the marketplace takes the note: Shopee waits on SERPRO. */
function sendDelayInMs(work: ResellerSaleIssueWork): number {
  return isShopee(work) ? SHOPEE_INVOICE_DELAY_IN_MS : 0;
}
const NOT_A_COMPANY =
  "Cadastre o CNPJ da sua empresa em Meu cadastro: a nota de venda sai no nome dela. Depois peça para tentar de novo.";

function resellerCnpjOf(due: DueResellerSaleInvoice): string {
  if (due.resellerCnpj === null) {
    throw new InvoiceStopError(NOT_A_COMPANY);
  }
  return due.resellerCnpj;
}

/** A definitive refusal of the create call clears the mark: the note surely does not exist. */
const DEFINITIVE_DRAFT_REFUSALS = new Set([400, 401, 403, 404, 422, 429]);

function requiredSettings(settings: ResellerBlingSettings | null): ResellerBlingSettings & {
  operationId: number;
} {
  if (settings === null || settings.operationId === null) {
    throw new InvoiceStopError(NO_OPERATION);
  }
  return { ...settings, operationId: settings.operationId };
}

function resellerStateOf(work: ResellerSaleIssueWork): string {
  const state = work.resellerAddress?.state.trim() ?? "";
  if (state === "") {
    throw new InvoiceStopError(NO_COMPANY_ADDRESS);
  }
  return state;
}

/** Each line at the buyer's price, with the product's NCM, origin and unit, and the sale CFOP. */
function saleItems(work: ResellerSaleIssueWork, cfop: string): BlingDirectInvoiceItem[] {
  if (work.lines.length === 0) {
    throw new InvoiceStopError(NO_LINES);
  }
  const defaults = work.supplierFiscal?.defaults ?? null;
  return work.lines.map((line) => {
    if (line.fiscal.ncm === null) {
      throw new InvoiceStopError(
        `O produto ${line.sku} está sem NCM no cadastro do fornecedor. Emita esta nota no seu sistema e envie o XML.`,
      );
    }
    return {
      sku: line.sku,
      description: line.title,
      unit: line.fiscal.unit ?? defaults?.unit ?? "UN",
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      ncm: line.fiscal.ncm,
      origin: line.fiscal.origin ?? defaults?.origin ?? 0,
      cfop,
    };
  });
}

function installmentOf(
  settings: ResellerBlingSettings,
  payment: MercadoLivreApprovedPayment,
  input: { amountCents: number; date: string; work: ResellerSaleIssueWork },
): BlingInvoiceInstallment {
  const found = paymentMethodFor(settings, payment);
  if (found.problem !== null) {
    throw new InvoiceStopError(found.problem);
  }
  const isCard = isCardSlot(found.slot);
  if (isCard && payment.authorizationCode === null) {
    throw new InvoiceStopError(noCardAuthorization(input.work));
  }
  return {
    date: input.date,
    amountCents: input.amountCents,
    paymentMethodId: found.methodId,
    authorizationCode: isCard ? payment.authorizationCode : null,
  };
}

/** The order's payments as the note's installments, splitting the note's total among them. */
function saleInstallments(
  settings: ResellerBlingSettings,
  payments: readonly MercadoLivreApprovedPayment[],
  input: { totalCents: number; date: string; work: ResellerSaleIssueWork },
): BlingInvoiceInstallment[] {
  if (payments.length === 0) {
    throw new InvoiceStopError(noApprovedPayment(input.work));
  }
  const amounts = allocateInstallments(input.totalCents, payments);
  return payments.map((payment, index) =>
    installmentOf(settings, payment, {
      amountCents: amounts[index] ?? 0,
      date: input.date,
      work: input.work,
    }),
  );
}

async function ensureBuyerContact(
  dependencies: ResellerSaleIssueDependencies,
  client: BlingClient,
  input: { due: DueResellerSaleInvoice; work: ResellerSaleIssueWork },
): Promise<number> {
  if (input.due.erpContactId !== null) {
    return input.due.erpContactId;
  }
  const billing = await dependencies.readBuyerBilling(input.work);
  if (billing === null) {
    throw new InvoiceStopError(noBuyerDocument(input.work));
  }
  const { address } = input.work;
  const contactAddress = {
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode.replace(/\D/g, ""),
  };
  const found = await client.findContactByDocument(billing.document);
  if (found !== null) {
    await client.updateContactAddress(found, contactAddress);
  }
  const contactId =
    found ??
    (await client.createContact({
      name: billing.name ?? address.recipient,
      personType: billing.documentType === "CPF" ? "F" : "J",
      document: billing.document,
      stateRegistration: billing.stateRegistration,
      address: contactAddress,
    }));
  await recordResellerSaleIssueProgress(dependencies.database, input.due.id, {
    erpContactId: contactId,
  });
  return contactId;
}

/**
 * Creates the note in the reseller's Bling, or finds the one an earlier attempt created and did
 * not get to save: the mark is set before the call, so a lost answer never makes a second note.
 */
async function createOrRecoverSaleNote(
  dependencies: ResellerSaleIssueDependencies,
  client: BlingClient,
  input: { due: DueResellerSaleInvoice; draft: BlingNewDirectInvoice; now: Date },
): Promise<number> {
  const { due, draft } = input;
  if (due.erpDraftRequestedAt !== null) {
    const recovered = await client.findPendingDirectInvoice({
      contactId: draft.contactId,
      operationId: draft.operationId,
      draftReference: draft.draftReference,
      since: `${brazilDay(due.erpDraftRequestedAt)} 00:00:00`,
    });
    if (recovered === null) {
      throw new InvoiceStopError(DRAFT_NOT_CONFIRMED);
    }
    return recovered;
  }
  const claimed = await claimResellerSaleDraft(dependencies.database, {
    invoiceId: due.id,
    now: input.now,
  });
  if (!claimed) {
    throw marketplaceError(DRAFT_TAKEN, { retryable: true });
  }
  try {
    return await client.createDirectInvoice(draft);
  } catch (error) {
    const status = isMarketplaceError(error) ? error.details.status : null;
    if (typeof status === "number" && DEFINITIVE_DRAFT_REFUSALS.has(status)) {
      await recordResellerSaleIssueProgress(dependencies.database, due.id, {
        erpDraftRequestedAt: null,
      });
    }
    throw error;
  }
}

/** The settings the note needs, with the CFOP for this buyer's state. */
function salePlan(work: ResellerSaleIssueWork) {
  const settings = requiredSettings(work.settings);
  const cfop = resellerSaleCfop(settings, {
    resellerState: resellerStateOf(work),
    buyerState: work.address.state,
  });
  return { settings, cfop };
}

type SalePlan = ReturnType<typeof salePlan>;

async function createSaleNote(
  dependencies: ResellerSaleIssueDependencies,
  client: BlingClient,
  input: { due: DueResellerSaleInvoice; work: ResellerSaleIssueWork; plan: SalePlan; now: Date },
): Promise<number> {
  const { due, work } = input;
  const { settings, cfop } = input.plan;
  const items = saleItems(work, cfop);
  const sellerAccount = sellerAccountOf(work);
  const totalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const sale = await dependencies.readSalePayments(work);
  const installments = saleInstallments(settings, sale.payments, {
    totalCents,
    date: brazilDay(work.orderedAt),
    work,
  });
  const contactId = await ensureBuyerContact(dependencies, client, { due, work });
  const draft: BlingNewDirectInvoice = {
    operationId: settings.operationId,
    contactId,
    operationDate: brazilDateTime(input.now),
    items,
    referencedInvoice: null,
    draftReference: `SellBridge venda ${due.id}`,
    notes: `Pedido ${work.externalOrderId} ${marketplaceIn(work)}, enviado pelo SellBridge.`,
    intermediary: { cnpj: intermediaryCnpjOf(work, settings), userName: sellerAccount },
    installments,
  };
  const invoiceId = await createOrRecoverSaleNote(dependencies, client, {
    due,
    draft,
    now: input.now,
  });
  await recordResellerSaleIssueProgress(dependencies.database, due.id, { erpInvoiceId: invoiceId });
  return invoiceId;
}

/**
 * Downloads the authorized note's XML, checks it is this note, issued by the reseller's CNPJ (a
 * Bling of another company issues in that company's name), and hands it to the marketplace once
 * the marketplace can know it.
 */
async function passOnAuthorized(
  dependencies: ResellerSaleIssueDependencies,
  client: BlingClient,
  input: {
    due: DueResellerSaleInvoice;
    work: ResellerSaleIssueWork;
    invoice: BlingInvoice;
    resellerCnpj: string;
    now: Date;
  },
): Promise<ResellerSaleIssueStep> {
  const accessKey = input.invoice.accessKey;
  if (accessKey === null) {
    return "waiting";
  }
  const issuerProblem = resellerAccessKeyProblem(accessKey, input.resellerCnpj);
  if (issuerProblem !== null) {
    throw new InvoiceStopError(`A nota que saiu do seu Bling não serve. ${issuerProblem}`);
  }
  const xml = new TextDecoder().decode(await client.getInvoiceDocument(accessKey, "xml"));
  const reading = readAuthorizedNfeXml(xml);
  const parts = parseAccessKey(accessKey);
  if (reading.accessKey !== accessKey || parts === null) {
    throw new InvoiceStopError(WRONG_XML);
  }
  const authorizedAt = reading.authorizedAt?.getTime() ?? 0;
  if (authorizedAt + sendDelayInMs(input.work) > input.now.getTime()) {
    return "waiting";
  }
  await dependencies.sendSaleInvoice(input.work, { accessKey, xml });
  await recordErpResellerSaleInvoice(dependencies.database, {
    invoiceId: input.due.id,
    parts,
    now: input.now,
  });
  return "issued";
}

/** Sends a note still being edited, once each line has the sale's CFOP; a sent one waits. */
async function sendWhenRight(
  dependencies: ResellerSaleIssueDependencies,
  client: BlingClient,
  input: {
    due: DueResellerSaleInvoice;
    invoiceId: number;
    invoice: BlingInvoice;
    cfop: string;
    now: Date;
  },
): Promise<ResellerSaleIssueStep> {
  if (input.due.erpSentAt !== null) {
    throw new InvoiceStopError(STUCK_IN_BLING);
  }
  const wrong = input.invoice.lines.find((line) => line.cfop?.trim() !== input.cfop);
  if (wrong !== undefined) {
    const actual = wrong.cfop === null ? "sem CFOP" : `com CFOP ${wrong.cfop.trim()}`;
    throw new InvoiceStopError(
      `O seu Bling montou a nota do produto ${wrong.sku} ${actual}, mas a configuração pede ${input.cfop}. Ajuste a natureza de operação no Bling ou o CFOP em Integrações › Bling e peça para tentar de novo.`,
    );
  }
  await client.sendInvoice(input.invoiceId);
  await recordResellerSaleIssueProgress(dependencies.database, input.due.id, {
    erpSentAt: input.now,
  });
  return "waiting";
}

/**
 * Before a note is first made in Bling, whether the reseller already attached one to the order by
 * hand: it is saved as the order's note, so Bling never issues a second one.
 */
async function keptAttachedNote(
  dependencies: ResellerSaleIssueDependencies,
  input: { due: DueResellerSaleInvoice; work: ResellerSaleIssueWork; resellerCnpj: string },
  now: Date,
): Promise<boolean> {
  const { due } = input;
  if (due.erpInvoiceId !== null || due.erpDraftRequestedAt !== null) {
    return false;
  }
  const attached = (await dependencies.readAttachedInvoice?.(input.work)) ?? null;
  if (attached === null) {
    return false;
  }
  const problem = resellerAccessKeyProblem(attached.accessKey, input.resellerCnpj);
  const parts = parseAccessKey(attached.accessKey);
  if (problem !== null || parts === null) {
    const reason = problem ?? WRONG_ATTACHED_KEY;
    throw new InvoiceStopError(
      `A nota anexada ao pedido ${marketplaceIn(input.work)} não serve. ${reason}`,
    );
  }
  await recordMarketplaceResellerSaleInvoice(dependencies.database, {
    invoiceId: due.id,
    parts,
    issuedAt: attached.issuedAt,
    now,
  });
  return true;
}

/**
 * Takes the reseller's note one step further in its own Bling: creates it (each id saved as it
 * comes), sends it to SEFAZ, and once authorized hands its XML to the marketplace.
 *
 * @throws {InvoiceStopError} When the reseller must act; other errors come from Bling or the
 * marketplace and are retried by the caller.
 */
export async function advanceResellerSaleIssue(
  dependencies: ResellerSaleIssueDependencies,
  input: { due: DueResellerSaleInvoice; work: ResellerSaleIssueWork; now: Date },
): Promise<ResellerSaleIssueStep> {
  const client = dependencies.clientFor(input.work.tenantId);
  if (client === null) {
    throw new InvoiceStopError(NO_BLING);
  }
  if (!input.work.erpConnected) {
    throw new InvoiceStopError(NO_BLING);
  }
  const resellerCnpj = resellerCnpjOf(input.due);
  if (await keptAttachedNote(dependencies, { ...input, resellerCnpj }, input.now)) {
    return "issued";
  }
  // A note already in Bling needs the settings only to check its CFOP: reconnecting clears them.
  const invoiceId =
    input.due.erpInvoiceId ??
    (await createSaleNote(dependencies, client, { ...input, plan: salePlan(input.work) }));
  const invoice = await client.getInvoice(invoiceId);
  const outcome = blingInvoiceOutcome(invoice.situacao);
  if (outcome === "authorized") {
    return passOnAuthorized(dependencies, client, { ...input, invoice, resellerCnpj });
  }
  if (outcome === "refused") {
    throw new InvoiceStopError(refusedInvoiceReason(invoice.situacao));
  }
  if (outcome === "cancelled") {
    throw new InvoiceStopError(CANCELLED_IN_BLING);
  }
  if (outcome === "editable") {
    return sendWhenRight(dependencies, client, {
      ...input,
      invoiceId,
      invoice,
      cfop: salePlan(input.work).cfop,
    });
  }
  return "waiting";
}

const NO_ANSWER_FROM_SEFAZ =
  "A SEFAZ não respondeu sobre esta nota depois de algumas horas. Veja a situação da nota no seu Bling e peça para tentar de novo.";
const ISSUE_FAILED =
  "O seu Bling recusou a nota. Abra o Bling para ver o motivo e peça para tentar de novo.";

/**
 * Runs one step of the note and saves what came of it: issued, waiting for the next check, or
 * stopped with the reason the reseller must act on. A passing failure is tried again later.
 *
 * @returns Whether the note is now issued and on the marketplace.
 */
export async function issueResellerSaleInvoice(
  dependencies: ResellerSaleIssueDependencies,
  due: DueResellerSaleInvoice,
  now: Date,
): Promise<boolean> {
  const { database } = dependencies;
  const checks = due.checks + 1;
  const next = { invoiceId: due.id, checks, nextCheckAt: nextResellerInvoiceCheckAt(checks, now) };
  try {
    const work = await loadResellerSaleIssueWork(database, due.id);
    if (work === null) {
      return false;
    }
    const step = await advanceResellerSaleIssue(dependencies, { due, work, now });
    if (step === "issued") {
      return true;
    }
    if (due.erpSentAt !== null && checks >= MAX_INVOICE_ATTEMPTS) {
      throw new InvoiceStopError(NO_ANSWER_FROM_SEFAZ);
    }
    await scheduleResellerSaleInvoiceCheck(database, { ...next, problem: null });
    return false;
  } catch (error) {
    if (!(error instanceof InvoiceStopError) && isRetryableError(error)) {
      logger.warn("reseller_invoice.issue_failed", { invoiceId: due.id, error });
      await scheduleResellerSaleInvoiceCheck(database, { ...next, problem: null });
      return false;
    }
    const problem =
      error instanceof InvoiceStopError ? error.problem : userMessageOr(error, ISSUE_FAILED);
    logger.warn("reseller_invoice.issue_stopped", { invoiceId: due.id, error });
    await stopResellerSaleIssue(database, { invoiceId: due.id, problem, now });
    return false;
  }
}
