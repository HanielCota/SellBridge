import {
  canReplaceResellerSaleInvoice,
  findBillingHolder,
  resellerSaleInvoicesOf,
  saveTypedResellerSaleInvoice,
  saveUploadedResellerSaleInvoice,
} from "@sellbridge/database/repositories";
import { conflictError, notFoundError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { parseAccessKey, resellerAccessKeyProblem } from "@sellbridge/shared/nfe-access-key";
import { readAuthorizedNfeXml } from "@sellbridge/shared/nfe-xml";
import { database } from "@/lib/server/database";
import { sendResellerSaleNoteToMarketplace } from "./marketplace.server";

const NOT_A_COMPANY =
  "Cadastre o CNPJ da sua empresa em Meu cadastro: a nota de venda sai no nome dela.";
const REMESSA_STARTED =
  "A remessa do fornecedor já cita a nota registrada neste pedido. Para trocar a nota, fale com o suporte do SellBridge.";

/**
 * Saves the key the reseller typed for its parcel, once it is a valid NF-e of the reseller's own
 * CNPJ. It replaces a wrong one while the supplier's remessa has not started.
 *
 * @throws {AppError} VALIDATION when the key does not serve, CONFLICT when the reseller has no
 * CNPJ or the remessa already cites another note, NOT_FOUND when the parcel waits for no note of
 * this reseller.
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
  await saveTypedResellerSaleInvoice(database, {
    tenantId,
    shipmentId: input.shipmentId,
    parts,
    now: new Date(),
  });
  logger.info("reseller_invoice.typed", { tenantId, shipmentId: input.shipmentId });
}

/**
 * Takes the XML of the reseller's own sale note: checks it is an authorized NF-e of the reseller's
 * CNPJ, sends it to the order's Mercado Livre shipment (the label needs it) and saves it. The note
 * already saved is a success; another one replaces it while the supplier's remessa has not
 * started. Nothing is saved when Mercado Livre refuses it.
 *
 * @throws {AppError} VALIDATION when the file does not serve, CONFLICT when the reseller has no
 * CNPJ, the order is not on Mercado Livre or the remessa already cites another note, NOT_FOUND
 * when the parcel waits for no note of this reseller, EXTERNAL_PROVIDER when Mercado Livre
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
  const saved = (await resellerSaleInvoicesOf(database, tenantId, [input.shipmentId])).get(
    input.shipmentId,
  );
  if (saved === undefined) {
    throw notFoundError("Este pedido não espera a sua nota de venda");
  }
  // The same note is already there and on the marketplace (sent before, or read there meanwhile).
  if (saved.accessKey === reading.accessKey && saved.source !== "typed") {
    return;
  }
  const replaceable = await canReplaceResellerSaleInvoice(database, {
    tenantId,
    shipmentId: input.shipmentId,
  });
  if (!replaceable) {
    throw conflictError(REMESSA_STARTED);
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
