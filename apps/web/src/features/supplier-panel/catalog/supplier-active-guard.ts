import { getSupplierApprovalState, isSupplierActive } from "@sellbridge/database/repositories";
import { forbiddenError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";

export const SUPPLIER_OFF_MESSAGE =
  "Sua conta de fornecedor está desligada: não dá para cadastrar, enviar ou importar produtos. Fale com o suporte para pedir uma revisão.";

export const SUPPLIER_REFUSED_MESSAGE =
  "O cadastro da sua marca foi recusado pela equipe: não dá para cadastrar, enviar ou importar produtos. Fale com o suporte para pedir uma revisão.";

/**
 * A switched-off supplier (3rd flag) keeps its panel to deliver the orders it already has, but
 * adds nothing to a catalog nobody sees: new drafts, submissions and imports are refused. So is
 * a supplier whose sign-up the team refused. A pending one may fill its catalog meanwhile.
 */
export async function assertSupplierAcceptsProducts(supplierId: string): Promise<void> {
  const [active, approval] = await Promise.all([
    isSupplierActive(database, supplierId),
    getSupplierApprovalState(database, supplierId),
  ]);
  if (approval.status === "refused") {
    logger.warn("supplier_panel.catalog_write_refused_not_approved", { supplierId });
    throw forbiddenError(SUPPLIER_REFUSED_MESSAGE);
  }
  if (active) {
    return;
  }
  logger.warn("supplier_panel.catalog_write_refused_off", { supplierId });
  throw forbiddenError(SUPPLIER_OFF_MESSAGE);
}
