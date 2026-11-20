import {
  recordShipmentInvoiceProgress,
  type CitedInvoice,
  type OnBehalfInvoiceContext,
  type OnBehalfReseller,
  type ShipmentInvoiceWork,
} from "@sellbridge/database/repositories";
import { isMarketplaceError } from "@sellbridge/marketplaces";
import type {
  BlingAddress,
  BlingDirectInvoiceItem,
  BlingNewDirectInvoice,
} from "@sellbridge/marketplaces/bling";
import { parseAccessKey } from "@sellbridge/shared/nfe-access-key";
import type { SupplierFiscalProfile } from "@sellbridge/shared/supplier-fiscal";
import { onBehalfCfop, resolveInvoiceItemTax } from "@sellbridge/shared/supplier-invoice";
import {
  brazilDay,
  buyerBilling,
  ensureContact,
  fiscalProfile,
  InvoiceStopError,
  now,
  orderItems,
  recordAnswer,
  sendWhenRight,
  type ExpectedCfop,
  type InvoiceStepDependencies,
  type OrderLine,
} from "./erp-invoice-steps.ts";

/**
 * The supplier's two notes of venda à ordem (model B): the remessa to the buyer, made straight in
 * Bling (it moves the goods but sells nothing), citing the reseller's sale note; and the sale to
 * the reseller, made from a sale order (stock and receivable, as in model A), citing the remessa.
 */

const NO_OPERATIONS =
  "Escolha em Marca as naturezas de operação da venda à ordem (remessa e venda ao revendedor) e peça para tentar de novo.";
const NO_RESELLER_COMPANY =
  "O revendedor deste pedido não tem mais CNPJ no cadastro, e a venda à ordem precisa da empresa dele. Fale com o suporte do SellBridge.";
const NO_RESELLER_ADDRESS =
  "O cadastro da empresa do revendedor está sem endereço, e a nota de venda precisa dele. Fale com o suporte do SellBridge.";
const NO_CITED_NOTE =
  "A nota que esta precisa citar não foi encontrada. Fale com o suporte do SellBridge.";

/** Bling takes the operation's date and time in Brazil, "YYYY-MM-DD HH:mm:ss". */
const DRAFT_NOT_CONFIRMED =
  "O Bling não confirmou a criação da remessa. Confira se a nota existe no Bling antes de enviar outra.";
const DEFINITIVE_DRAFT_REFUSALS = new Set([400, 401, 403, 404, 422, 429]);

const BRAZIL_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function brazilDateTime(date: Date): string {
  return `${brazilDay(date)} ${BRAZIL_TIME.format(date)}`;
}

function contextOf(work: ShipmentInvoiceWork): OnBehalfInvoiceContext {
  if (work.onBehalf === null) {
    throw new Error(`Invoice ${work.id} of kind ${work.kind} has no venda à ordem context`);
  }
  return work.onBehalf;
}

function requiredOperation(operationId: number | null): number {
  if (operationId === null) {
    throw new InvoiceStopError(NO_OPERATIONS);
  }
  return operationId;
}

function requiredCited(cited: CitedInvoice | null): CitedInvoice {
  if (cited === null) {
    throw new InvoiceStopError(NO_CITED_NOTE);
  }
  return cited;
}

function requiredReseller(reseller: OnBehalfReseller | null): OnBehalfReseller {
  if (reseller === null) {
    throw new InvoiceStopError(NO_RESELLER_COMPANY);
  }
  return reseller;
}

/** "45.723.174/0001-10", as the note's text names the company. */
function formattedCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function citedNumber(cited: CitedInvoice): string {
  const series = cited.series === null ? "" : `, série ${cited.series}`;
  return `NF-e ${cited.number ?? "sem número"}${series}, chave ${cited.accessKey}`;
}

/** Human-readable order reference to print on the note. */
function orderMarker(work: ShipmentInvoiceWork): string {
  return `Pedido ${work.externalOrderId}, enviado pelo SellBridge.`;
}

/**
 * Each line at the reseller's cost (what the supplier sells it for), with its NCM, origin and
 * unit from the product or the supplier's defaults, and the venda à ordem CFOP.
 */
function costLines(
  work: ShipmentInvoiceWork,
  profile: SupplierFiscalProfile,
  input: { kind: "on_behalf_shipment" | "on_behalf_sale"; recipientState: string },
) {
  const cfop = onBehalfCfop(profile.onBehalfCfops, {
    kind: input.kind,
    supplierState: profile.address.state,
    recipientState: input.recipientState,
  });
  return work.lines.map((line) => {
    const tax = resolveInvoiceItemTax({
      sku: line.sku,
      product: line.fiscal,
      defaults: profile.defaults,
      supplierState: profile.address.state,
      recipientState: input.recipientState,
      recipientPaysIcms: false,
    });
    return { line, tax: { ...tax, cfop } };
  });
}

function expectedCfops(lines: ReturnType<typeof costLines>): ExpectedCfop[] {
  return lines.map(({ line, tax }) => ({ sku: line.sku, cfop: tax.cfop }));
}

function remessaItems(lines: ReturnType<typeof costLines>): BlingDirectInvoiceItem[] {
  return lines.map(({ line, tax }) => ({
    sku: line.sku,
    description: line.title,
    unit: tax.unit,
    quantity: line.quantity,
    unitPriceCents: line.unitCostCents,
    ncm: tax.ncm,
    origin: tax.origin,
    cfop: tax.cfop,
  }));
}

function remessaNotes(
  work: ShipmentInvoiceWork,
  cited: CitedInvoice,
  reseller: OnBehalfReseller,
): string {
  return [
    "Remessa por conta e ordem de terceiros.",
    `Venda ao comprador: ${citedNumber(cited)}, emitida por ${reseller.legalName}, CNPJ ${formattedCnpj(reseller.cnpj)}.`,
    orderMarker(work),
  ].join(" ");
}

async function ensureRemessa(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
  lines: ReturnType<typeof costLines>,
): Promise<number> {
  if (work.erpInvoiceId !== null) {
    return work.erpInvoiceId;
  }
  const context = contextOf(work);
  const operationId = requiredOperation(context.shipmentOperationId);
  const cited = requiredCited(context.resellerNote);
  const reseller = requiredReseller(context.reseller);
  const parts = parseAccessKey(cited.accessKey);
  if (parts === null) {
    throw new InvoiceStopError(NO_CITED_NOTE);
  }
  const contactId = await ensureContact(dependencies, work, await buyerBilling(dependencies, work));
  const invoiceId = await createOrRecoverRemessa(dependencies, work, {
    operationId,
    contactId,
    operationDate: brazilDateTime(now(dependencies)),
    items: remessaItems(lines),
    referencedInvoice: { ...cited, yearMonth: parts.yearMonth },
    notes: remessaNotes(work, cited, reseller),
    draftReference: `SellBridge remessa ${work.id}`,
  });
  await recordShipmentInvoiceProgress(dependencies.database, work.id, { erpInvoiceId: invoiceId });
  return invoiceId;
}

async function createOrRecoverRemessa(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
  draft: BlingNewDirectInvoice,
): Promise<number> {
  const { client, database } = dependencies;
  const requestedAt = work.erpDraftRequestedAt;

  if (requestedAt !== null) {
    const recovered = await client.findPendingDirectInvoice({
      contactId: draft.contactId,
      operationId: draft.operationId,
      draftReference: draft.draftReference,
      since: `${brazilDay(requestedAt)} 00:00:00`,
    });

    if (recovered === null) {
      throw new InvoiceStopError(DRAFT_NOT_CONFIRMED);
    }

    return recovered;
  }

  await recordShipmentInvoiceProgress(database, work.id, {
    erpDraftRequestedAt: now(dependencies),
  });

  try {
    return await client.createDirectInvoice(draft);
  } catch (error) {
    const status = isMarketplaceError(error) ? error.details.status : null;
    if (typeof status === "number" && DEFINITIVE_DRAFT_REFUSALS.has(status)) {
      await recordShipmentInvoiceProgress(database, work.id, { erpDraftRequestedAt: null });
    }

    throw error;
  }
}

function companyAddress(reseller: OnBehalfReseller): BlingAddress {
  const { address } = reseller;
  if (address === null) {
    throw new InvoiceStopError(NO_RESELLER_ADDRESS);
  }
  return {
    street: address.street,
    number: address.number,
    complement: address.complement,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    postalCode: address.cep.replace(/\D/g, ""),
  };
}

/** "ISENTO" is no registration for the note: the company is not an ICMS taxpayer. */
function taxpayerRegistration(reseller: OnBehalfReseller): string | null {
  const registration = reseller.stateRegistration?.trim() ?? "";
  if (registration === "" || registration.toUpperCase() === "ISENTO") {
    return null;
  }
  return registration;
}

async function ensureResellerContact(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
  reseller: OnBehalfReseller,
): Promise<number> {
  if (work.erpContactId !== null) {
    return work.erpContactId;
  }
  const { client } = dependencies;
  const address = companyAddress(reseller);
  const found = await client.findContactByDocument(reseller.cnpj);
  if (found !== null) {
    await client.updateContactAddress(found, address);
  }
  const contactId =
    found ??
    (await client.createContact({
      name: reseller.legalName,
      personType: "J",
      document: reseller.cnpj,
      stateRegistration: taxpayerRegistration(reseller),
      address,
    }));
  await recordShipmentInvoiceProgress(dependencies.database, work.id, { erpContactId: contactId });
  return contactId;
}

function saleNotes(work: ShipmentInvoiceWork, cited: CitedInvoice): string {
  return [
    "Venda à ordem.",
    `Mercadoria entregue ao comprador pela remessa ${citedNumber(cited)}.`,
    orderMarker(work),
  ].join(" ");
}

async function ensureSaleToReseller(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
  lines: ReturnType<typeof costLines>,
): Promise<number> {
  if (work.erpInvoiceId !== null) {
    return work.erpInvoiceId;
  }
  const context = contextOf(work);
  const operationId = requiredOperation(context.saleOperationId);
  const cited = requiredCited(context.shipmentNote);
  const reseller = requiredReseller(context.reseller);
  const contactId = await ensureResellerContact(dependencies, work, reseller);
  const { client, database } = dependencies;
  const orderId =
    work.erpOrderId ??
    // An earlier attempt may have created it and stopped before saving its id.
    (await client.findSaleOrderByStoreNumber(work.externalOrderId)) ??
    (await client.createSaleOrder({
      storeOrderNumber: work.externalOrderId,
      date: brazilDay(work.orderedAt),
      shippingDate: brazilDay(now(dependencies)),
      contact: { id: contactId, name: reseller.legalName },
      items: await orderItems(client, saleOrderLines(lines)),
      notes: saleNotes(work, cited),
      operationId,
    }));
  await recordShipmentInvoiceProgress(database, work.id, { erpOrderId: orderId });
  // A "gerar-nfe" whose answer was lost (timeout, restart) may have made the note already.
  const invoiceId =
    (await client.findSaleOrderInvoice(orderId)) ?? (await client.generateInvoice(orderId));
  await recordShipmentInvoiceProgress(database, work.id, { erpInvoiceId: invoiceId });
  return invoiceId;
}

function saleOrderLines(lines: ReturnType<typeof costLines>): OrderLine[] {
  return lines.map(({ line, tax }) => ({
    sku: line.sku,
    title: line.title,
    quantity: line.quantity,
    unit: tax.unit,
    unitPriceCents: line.unitCostCents,
  }));
}

function recipientState(work: ShipmentInvoiceWork): string {
  if (work.kind === "on_behalf_shipment") {
    return work.address.state;
  }
  const reseller = requiredReseller(contextOf(work).reseller);
  return companyAddress(reseller).state;
}

/**
 * Takes a venda à ordem note one step further, like the direct note: a queued note gets its ids
 * in Bling (each saved as it comes) and goes to SEFAZ once its CFOPs match the settings; a sent
 * note gets SEFAZ's answer.
 *
 * @throws {InvoiceStopError} When the supplier must act; other errors come from Bling or the
 * sales channel and are retried or stopped by the caller.
 */
export async function advanceOnBehalfInvoice(
  dependencies: InvoiceStepDependencies,
  work: ShipmentInvoiceWork,
): Promise<void> {
  if (work.kind === "direct") {
    throw new Error(`Invoice ${work.id} is a direct note, not one of venda à ordem`);
  }
  if (work.status === "sent" && work.erpInvoiceId !== null) {
    await recordAnswer(dependencies, work, await dependencies.client.getInvoice(work.erpInvoiceId));
    return;
  }
  const profile = fiscalProfile(work);
  if (work.lines.length === 0) {
    throw new InvoiceStopError("Este pedido não tem itens para a nota.");
  }
  const lines = costLines(work, profile, {
    kind: work.kind,
    recipientState: recipientState(work),
  });
  const invoiceId =
    work.kind === "on_behalf_shipment"
      ? await ensureRemessa(dependencies, work, lines)
      : await ensureSaleToReseller(dependencies, work, lines);
  await sendWhenRight(dependencies, work, expectedCfops(lines), invoiceId);
}
