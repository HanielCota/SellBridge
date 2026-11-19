import { runSupplierApprovalCheck } from "@sellbridge/database/repositories";
import { createCnpjLookup } from "@sellbridge/shared/cnpj-lookup";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";

const lookUpCnpj = createCnpjLookup({ baseUrl: environment.CNPJ_LOOKUP_URL });

/**
 * Runs the approval check right after the supplier saves its brand, so a supplier whose CNPJ
 * passes is approved at once. A failure here never undoes the save: the worker's round checks
 * pending suppliers again.
 */
export async function checkSupplierApprovalAfterSave(supplierId: string): Promise<void> {
  try {
    const status = await runSupplierApprovalCheck(database, supplierId, { lookUpCnpj });
    logger.info("supplier_approval.checked", { supplierId, status });
  } catch (error) {
    logger.error("supplier_approval.check_failed", { supplierId, error });
  }
}
