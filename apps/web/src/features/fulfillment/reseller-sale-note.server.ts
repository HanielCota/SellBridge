import { findBillingHolder, saveTypedResellerSaleInvoice } from "@sellbridge/database/repositories";
import { conflictError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { parseAccessKey, resellerAccessKeyProblem } from "@sellbridge/shared/nfe-access-key";
import { database } from "@/lib/server/database";

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
