import type { Database } from "@sellbridge/database";
import {
  markShipmentInvoiceAuthorized,
  markShipmentInvoiceCancelled,
  markShipmentInvoiceSent,
  recordShipmentInvoiceProgress,
  type ShipmentInvoiceWork,
} from "@sellbridge/database/repositories";
import { isRetryableError, type BuyerBilling } from "@sellbridge/marketplaces";
import type {
  BlingAddress,
  BlingClient,
  BlingInvoice,
  BlingSaleOrderItem,
} from "@sellbridge/marketplaces/bling";
import type { SupplierFiscalProfile } from "@sellbridge/shared/supplier-fiscal";
import {
  AVAILABLE_INVOICE_MODELS,
  blingInvoiceOutcome,
  INVOICE_STATUS_CHECK_IN_MS,
  invoiceCfopProblem,
  refusedInvoiceReason,
  resolveInvoiceItemTax,
  type InvoiceItemTax,
} from "@sellbridge/shared/supplier-invoice";

/** A stop the supplier must act on; `problem` says what to do, in their words. */
export class InvoiceStopError extends Error {
  readonly problem: string;
  constructor(problem: string) {
    super(`Invoice stopped: ${problem}`);
    this.name = "InvoiceStopError";
    this.problem = problem;
  }
}

export interface InvoiceStepDependencies {
  readonly database: Database;
  readonly client: BlingClient;
  readonly readBuyerBilling: (work: ShipmentInvoiceWork) => Promise<BuyerBilling | null>;
  readonly now?: () => Date;
}

interface PlannedLine {
  readonly line: ShipmentInvoiceWork["lines"][number];
  readonly tax: InvoiceItemTax;
}

/** Everything the ERP needs before the first call, or the stop that keeps it from starting. */
interface InvoicePlan {
  readonly billing: BuyerBilling;
  readonly lines: readonly PlannedLine[];
}

const NO_FISCAL_PROFILE =
  "Preencha os dados fiscais da empresa em Marca (CNPJ, endereço e padrões da nota) e peça para tentar de novo.";
const MODEL_NOT_AVAILABLE =
  'A venda à ordem ainda não está disponível. Em Marca, em "Como sai a nota", escolha "Direto para o cliente" e peça para tentar de novo.';
const NO_BUYER_DOCUMENT =
  "O canal de venda não informou o CPF ou CNPJ do comprador. Emita esta nota direto no Bling.";
const STUCK_IN_BLING =
  "A nota ficou no Bling sem ir para a SEFAZ. Abra a nota no Bling e envie por lá.";

function now(dependencies: InvoiceStepDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

function fiscalProfile(work: ShipmentInvoiceWork): SupplierFiscalProfile {
  const profile = work.supplierFiscal;
  if (profile === null) {
    throw new InvoiceStopError(NO_FISCAL_PROFILE);
  }
  if (!AVAILABLE_INVOICE_MODELS.includes(profile.invoiceModel)) {
    throw new InvoiceStopError(MODEL_NOT_AVAILABLE);
  }
  return profile;
}

/** A passing failure of the channel is retried; any other is a stop with its reason. */
async function buyerBilling(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
): Promise<BuyerBilling> {
  try {
    const billing = await dependencies.readBuyerBilling(work);
    if (billing === null) {
      throw new InvoiceStopError(NO_BUYER_DOCUMENT);
    }
    return billing;
  } catch (error) {
    if (error instanceof InvoiceStopError || isRetryableError(error)) {
      throw error;
    }
    throw new InvoiceStopError(
      "Não deu para ler o CPF ou CNPJ do comprador no canal de venda. Confira se a loja do revendedor está conectada e peça para tentar de novo.",
    );
  }
}

async function planInvoice(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
): Promise<InvoicePlan> {
  const profile = fiscalProfile(work);
  if (work.lines.length === 0) {
    throw new InvoiceStopError("Este pedido não tem itens para a nota.");
  }
  const billing = await buyerBilling(dependencies, work);
  const lines = work.lines.map((line) => ({
    line,
    tax: resolveInvoiceItemTax({
      sku: line.sku,
      product: line.fiscal,
      defaults: profile.defaults,
      supplierState: profile.address.state,
      recipientState: work.address.state,
      recipientPaysIcms: billing.stateRegistration !== null,
    }),
  }));
  return { billing, lines };
}

function deliveryAddress(work: ShipmentInvoiceWork): BlingAddress {
  const { address } = work;
  return {
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode.replace(/\D/g, ""),
  };
}

function recipientName(work: ShipmentInvoiceWork, billing: BuyerBilling): string {
  return billing.name ?? work.address.recipient;
}

async function ensureContact(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
  billing: BuyerBilling,
): Promise<number> {
  if (work.erpContactId !== null) {
    return work.erpContactId;
  }
  const { client } = dependencies;
  const found = await client.findContactByDocument(billing.document);
  if (found !== null) {
    await client.updateContactAddress(found, deliveryAddress(work));
  }
  const contactId =
    found ??
    (await client.createContact({
      name: recipientName(work, billing),
      personType: billing.documentType === "CPF" ? "F" : "J",
      document: billing.document,
      stateRegistration: billing.stateRegistration,
      address: deliveryAddress(work),
    }));
  await recordShipmentInvoiceProgress(dependencies.database, work.id, { erpContactId: contactId });
  return contactId;
}

/** Bling's product of each line, matched by SKU (Bling's `codigo`). */
async function orderItems(
  client: BlingClient,
  lines: readonly PlannedLine[],
): Promise<BlingSaleOrderItem[]> {
  const found = await client.findProductsByCodes(lines.map(({ line }) => line.sku));
  const idBySku = new Map(
    found.flatMap((product) =>
      product.codigo == null ? [] : [[product.codigo, product.id] as const],
    ),
  );
  return lines.map(({ line, tax }) => {
    const productId = idBySku.get(line.sku);
    if (productId === undefined) {
      throw new InvoiceStopError(
        `O produto ${line.sku} não está no Bling. Cadastre no Bling com esse mesmo código e peça para tentar de novo.`,
      );
    }
    return {
      sku: line.sku,
      productId,
      description: line.title,
      unit: tax.unit,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    };
  });
}

/** Bling takes the sale order's dates as calendar days in Brazil (en-CA writes YYYY-MM-DD). */
const BRAZIL_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function brazilDay(date: Date): string {
  return BRAZIL_DAY.format(date);
}

async function ensureSaleOrder(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
  plan: InvoicePlan,
  contactId: number,
): Promise<number> {
  if (work.erpOrderId !== null) {
    return work.erpOrderId;
  }
  const { client } = dependencies;
  // An earlier attempt may have created it and stopped before saving its id.
  const found = await client.findSaleOrderByStoreNumber(work.externalOrderId);
  const orderId =
    found ??
    (await client.createSaleOrder({
      storeOrderNumber: work.externalOrderId,
      date: brazilDay(work.orderedAt),
      shippingDate: brazilDay(now(dependencies)),
      contact: { id: contactId, name: recipientName(work, plan.billing) },
      items: await orderItems(client, plan.lines),
      notes: `Venda ${work.externalOrderId}, enviada pelo SellBridge.`,
    }));
  await recordShipmentInvoiceProgress(dependencies.database, work.id, { erpOrderId: orderId });
  return orderId;
}

async function ensureInvoice(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
  plan: InvoicePlan,
): Promise<number> {
  if (work.erpInvoiceId !== null) {
    return work.erpInvoiceId;
  }
  const contactId = await ensureContact(dependencies, work, plan.billing);
  const orderId = await ensureSaleOrder(dependencies, work, plan, contactId);
  const { client } = dependencies;
  // A "gerar-nfe" whose answer was lost (timeout, restart) may have made the note already.
  const invoiceId =
    (await client.findSaleOrderInvoice(orderId)) ?? (await client.generateInvoice(orderId));
  await recordShipmentInvoiceProgress(dependencies.database, work.id, { erpInvoiceId: invoiceId });
  return invoiceId;
}

/** Saves what Bling says of a note already handed over (or decided) by SEFAZ. */
async function recordAnswer(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
  invoice: BlingInvoice,
): Promise<void> {
  const { database } = dependencies;
  const outcome = blingInvoiceOutcome(invoice.situacao);
  if (outcome === "authorized") {
    await markShipmentInvoiceAuthorized(database, {
      invoiceId: work.id,
      number: invoice.number ?? "",
      series: invoice.series,
      accessKey: invoice.accessKey,
      danfeUrl: invoice.danfeUrl,
      authorizedAt: now(dependencies),
    });
    return;
  }
  if (outcome === "cancelled") {
    await markShipmentInvoiceCancelled(database, work.id);
    return;
  }
  if (outcome === "refused") {
    throw new InvoiceStopError(refusedInvoiceReason(invoice.situacao));
  }
  if (outcome === "editable") {
    throw new InvoiceStopError(STUCK_IN_BLING);
  }
  await markShipmentInvoiceSent(database, {
    invoiceId: work.id,
    checkAt: new Date(now(dependencies).getTime() + INVOICE_STATUS_CHECK_IN_MS),
  });
}

/** Sends a note still being edited, once every line carries the CFOP the settings ask for. */
async function sendWhenRight(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
  plan: InvoicePlan,
  invoiceId: number,
): Promise<void> {
  const invoice = await dependencies.client.getInvoice(invoiceId);
  if (blingInvoiceOutcome(invoice.situacao) !== "editable") {
    await recordAnswer(dependencies, work, invoice);
    return;
  }
  const cfopBySku = new Map(invoice.lines.map((line) => [line.sku, line.cfop]));
  const problem = invoiceCfopProblem(
    plan.lines.map(({ line, tax }) => ({
      sku: line.sku,
      expectedCfop: tax.cfop,
      actualCfop: cfopBySku.get(line.sku) ?? null,
    })),
  );
  if (problem !== null) {
    throw new InvoiceStopError(problem);
  }
  await dependencies.client.sendInvoice(invoiceId);
  await markShipmentInvoiceSent(dependencies.database, {
    invoiceId: work.id,
    checkAt: new Date(now(dependencies).getTime() + INVOICE_STATUS_CHECK_IN_MS),
  });
}

/**
 * Takes the note one step further: a queued note gets its contact, sale order and NF-e in Bling
 * (each id saved as it comes, so a retry goes on from there) and goes to SEFAZ; a sent note gets
 * SEFAZ's answer.
 *
 * @throws {InvoiceStopError} When the supplier must act; other errors come from Bling or the
 * sales channel and are retried or stopped by the caller.
 */
export async function advanceInvoice(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
): Promise<void> {
  if (work.status === "sent" && work.erpInvoiceId !== null) {
    await recordAnswer(dependencies, work, await dependencies.client.getInvoice(work.erpInvoiceId));
    return;
  }
  const plan = await planInvoice(dependencies, work);
  const invoiceId = await ensureInvoice(dependencies, work, plan);
  await sendWhenRight(dependencies, work, plan, invoiceId);
}
