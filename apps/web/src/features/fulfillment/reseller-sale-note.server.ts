import {
  canReplaceResellerSaleInvoice,
  findBillingHolder,
  resellerSaleErpInvoiceIdOf,
  resellerSaleInvoicesOf,
  saveTypedResellerSaleInvoice,
  saveUploadedResellerSaleInvoice,
  type ResellerSaleInvoice,
} from "@sellbridge/database/repositories";
import type { BlingInvoice } from "@sellbridge/marketplaces/bling";
import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  parseAccessKey,
  resellerAccessKeyProblem,
  type AccessKeyParts,
} from "@sellbridge/shared/nfe-access-key";
import { readAuthorizedNfeXml } from "@sellbridge/shared/nfe-xml";
import { blingInvoiceOutcome } from "@sellbridge/shared/supplier-invoice";
import {
  blingCredentials,
  resellerBlingClient,
} from "@/features/supplier-panel/bling/bling-access.server";
import { database } from "@/lib/server/database";
import { sendResellerSaleNoteToMarketplace } from "./marketplace.server";

const NOT_A_COMPANY =
  "Cadastre o CNPJ da sua empresa em Meu cadastro: a nota de venda sai no nome dela.";
const REMESSA_STARTED =
  "A remessa do fornecedor já cita a nota registrada neste pedido. Para trocar a nota, fale com o suporte do SellBridge.";
const NO_NOTE_AWAITED = "Este pedido não espera a sua nota de venda";
const BLING_NOTE_SAVED =
  "Esta venda já tem a nota que saiu do seu Bling. Para trocar, cancele essa nota no Bling e fale com o suporte do SellBridge.";
const BLING_ISSUING =
  "O seu Bling está emitindo a nota desta venda. Espere: se ele parar, o motivo aparece aqui e você pode enviar outra nota.";
const BLING_AT_SEFAZ =
  "A nota do seu Bling foi para a SEFAZ e ainda não voltou. Espere a resposta antes de enviar outra, para a venda não ficar com duas notas.";
const BLING_UNREACHABLE =
  "Não deu para conferir a nota que o seu Bling começou. Confira se ele está conectado em Integrações e tente de novo em alguns minutos.";

function blingAuthorized(number: string | null): string {
  const which = number === null ? "uma nota autorizada" : `a nota ${number} autorizada`;
  return `O seu Bling já tem ${which} para esta venda. Envie o XML dela, ou cancele essa nota no Bling antes de enviar outra.`;
}

/** The parcel's saved note; a parcel that waits for no note of this reseller is refused. */
async function savedNoteOf(tenantId: string, shipmentId: string): Promise<ResellerSaleInvoice> {
  const saved = (await resellerSaleInvoicesOf(database, tenantId, [shipmentId])).get(shipmentId);
  if (saved === undefined) {
    throw notFoundError(NO_NOTE_AWAITED);
  }
  return saved;
}

/** The note as the reseller's Bling has it now; any failure to ask is a refusal to go on. */
async function blingNoteOf(tenantId: string, erpInvoiceId: number): Promise<BlingInvoice> {
  const credentials = blingCredentials();
  if (credentials === null) {
    throw conflictError(BLING_UNREACHABLE);
  }
  try {
    return await resellerBlingClient(tenantId, credentials).getInvoice(erpInvoiceId);
  } catch (error) {
    logger.warn("reseller_invoice.bling_check_failed", { tenantId, error });
    throw conflictError(BLING_UNREACHABLE);
  }
}

/**
 * Refuses another note while the reseller's Bling holds the sale's own: the one it issued, the
 * one it is still working on, or one it sent to SEFAZ before stopping. Its stopped note is asked
 * of Bling now: authorized, only that note serves; refused, cancelled or never sent, another may.
 * Checked again on save (see `saveTypedResellerSaleInvoice`) against a run that starts meanwhile.
 *
 * @throws {AppError} CONFLICT when the sale would end up with two notes, or Bling cannot say.
 */
async function refuseWhileBlingHoldsTheNote(
  tenantId: string,
  input: { shipmentId: string; saved: ResellerSaleInvoice; accessKey: string },
): Promise<void> {
  const { saved } = input;
  if (saved.accessKey === input.accessKey) {
    return;
  }
  if (saved.source === "bling") {
    throw conflictError(BLING_NOTE_SAVED);
  }
  if (saved.accessKey !== null || !saved.issuedByErp) {
    return;
  }
  if (!saved.erpStopped) {
    throw conflictError(BLING_ISSUING);
  }
  const erpInvoiceId = await resellerSaleErpInvoiceIdOf(database, {
    tenantId,
    shipmentId: input.shipmentId,
  });
  if (erpInvoiceId === null) {
    return;
  }
  const note = await blingNoteOf(tenantId, erpInvoiceId);
  const outcome = blingInvoiceOutcome(note.situacao);
  if (outcome === "waiting") {
    throw conflictError(BLING_AT_SEFAZ);
  }
  if (outcome === "authorized" && note.accessKey !== input.accessKey) {
    throw conflictError(blingAuthorized(note.number));
  }
}

/**
 * Saves the key the reseller typed for its parcel, once it is a valid NF-e of the reseller's own
 * CNPJ. It replaces a wrong one while the supplier's remessa has not started.
 *
 * @throws {AppError} VALIDATION when the key does not serve, CONFLICT when the reseller has no
 * CNPJ, the remessa already cites another note or its Bling holds the sale's note, NOT_FOUND when
 * the parcel waits for no note of this reseller.
 */
export async function saveResellerSaleNote(
  tenantId: string,
  input: { shipmentId: string; accessKey: string },
): Promise<void> {
  const holder = await findBillingHolder(database, tenantId);
  const cnpj = holder?.company?.cnpj ?? null;
  if (cnpj === null) {
    throw conflictError(NOT_A_COMPANY);
  }
  const problem = resellerAccessKeyProblem(input.accessKey, cnpj);
  const parts = parseAccessKey(input.accessKey);
  if (problem !== null || parts === null) {
    throw validationError(problem ?? "Confira a chave de acesso e tente de novo.");
  }
  const saved = await savedNoteOf(tenantId, input.shipmentId);
  await refuseWhileBlingHoldsTheNote(tenantId, {
    shipmentId: input.shipmentId,
    saved,
    accessKey: parts.accessKey,
  });
  await saveTypedResellerSaleInvoice(database, {
    tenantId,
    shipmentId: input.shipmentId,
    parts,
    now: new Date(),
  });
  logger.info("reseller_invoice.typed", { tenantId, shipmentId: input.shipmentId });
}

/**
 * Puts another note over the saved one, as typed: on Mercado Livre the remessa waits for the note
 * to be there, so it cannot start citing this one before Mercado Livre has it.
 *
 * @throws {AppError} CONFLICT when the supplier's remessa already cites the saved note.
 */
async function replaceBeforeSending(
  tenantId: string,
  input: { shipmentId: string; parts: AccessKeyParts },
): Promise<void> {
  const replaceable = await canReplaceResellerSaleInvoice(database, {
    tenantId,
    shipmentId: input.shipmentId,
  });
  if (!replaceable) {
    throw conflictError(REMESSA_STARTED);
  }
  await saveTypedResellerSaleInvoice(database, {
    tenantId,
    shipmentId: input.shipmentId,
    parts: input.parts,
    now: new Date(),
  });
}

/**
 * Takes the XML of the reseller's own sale note: checks it is an authorized NF-e of the reseller's
 * CNPJ, sends it to the order's Mercado Livre shipment (the label needs it) and saves it. The note
 * already saved is a success; another one replaces it while the supplier's remessa has not
 * started. Nothing is saved when Mercado Livre refuses it.
 *
 * @throws {AppError} VALIDATION when the file does not serve, CONFLICT when the reseller has no
 * CNPJ, the order is not on Mercado Livre, the remessa already cites another note or its Bling
 * holds the sale's note, NOT_FOUND when the parcel waits for no note of this reseller, EXTERNAL_PROVIDER when Mercado Livre
 * refuses the note.
 */
export async function uploadResellerSaleNoteXml(
  tenantId: string,
  input: { shipmentId: string; xml: string },
): Promise<void> {
  const holder = await findBillingHolder(database, tenantId);
  const cnpj = holder?.company?.cnpj ?? null;
  if (cnpj === null) {
    throw conflictError(NOT_A_COMPANY);
  }
  const reading = readAuthorizedNfeXml(input.xml);
  if (reading.problem !== null) {
    throw validationError(reading.problem);
  }
  const problem = resellerAccessKeyProblem(reading.accessKey, cnpj);
  const parts = parseAccessKey(reading.accessKey);
  if (problem !== null || parts === null) {
    throw validationError(problem ?? "Confira o arquivo da nota e tente de novo.");
  }
  // Checked before the marketplace gets the note: a refusal here must not leave it sent there.
  const saved = await savedNoteOf(tenantId, input.shipmentId);
  const sameNote = saved.accessKey === reading.accessKey;
  // The same note is already there and on the marketplace (sent before, or read there meanwhile).
  if (sameNote && saved.source !== "typed") {
    return;
  }
  await refuseWhileBlingHoldsTheNote(tenantId, {
    shipmentId: input.shipmentId,
    saved,
    accessKey: reading.accessKey,
  });
  if (!sameNote) {
    await replaceBeforeSending(tenantId, { shipmentId: input.shipmentId, parts });
  }
  await sendResellerSaleNoteToMarketplace(tenantId, {
    shipmentId: input.shipmentId,
    accessKey: reading.accessKey,
    xml: input.xml,
  });
  await saveUploadedResellerSaleInvoice(database, {
    tenantId,
    shipmentId: input.shipmentId,
    parts,
    now: new Date(),
  });
  logger.info("reseller_invoice.uploaded", { tenantId, shipmentId: input.shipmentId });
}
