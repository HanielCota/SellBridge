import {
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

/**
 * Saves the key the reseller typed for its parcel, once it is a valid NF-e of the reseller's own
 * CNPJ.
 *
 * @throws {AppError} VALIDATION when the key does not serve, CONFLICT when the reseller has no
 * CNPJ or the note is already saved, NOT_FOUND when the parcel waits for no note of this reseller.
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
 * CNPJ, sends it to the marketplace of the order (Mercado Livre needs it for the label) and saves
 * it. Nothing is saved when the marketplace refuses it.
 *
 * @throws {AppError} VALIDATION when the file does not serve, CONFLICT when the reseller has no
 * CNPJ or another note is saved, NOT_FOUND when the parcel waits for no note of this reseller,
 * EXTERNAL_PROVIDER when the marketplace refuses the note.
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
  const otherNote =
    saved.accessKey !== null && (saved.accessKey !== reading.accessKey || saved.source !== "typed");
  if (otherNote) {
    throw conflictError("Este pedido já tem a sua nota de venda registrada.");
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
