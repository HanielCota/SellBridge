import type { SupplierApprovalStatus } from "@sellbridge/shared/supplier-approval";
import { logger } from "@sellbridge/shared/logger";

/** Few suppliers sign up at once; this keeps a round far from any limit of the public query. */
export const SUPPLIERS_PER_ROUND = 20;

export interface SupplierApprovalDependencies {
  /** Pending suppliers outside the team queue, least recently checked first, at most `limit`. */
  readonly listPending: (limit: number) => Promise<string[]>;
  /** Runs the automatic check of one supplier and returns its status afterwards. */
  readonly check: (supplierId: string) => Promise<SupplierApprovalStatus>;
}

/**
 * Checks pending suppliers again: a CNPJ query that was down is retried, and a supplier waiting
 * for its receiving account or for the admin switch moves on by itself. One at a time, so a
 * round never fires a burst at the public query; one supplier failing never stops the round.
 */
export function createSupplierApprovalProcessor(dependencies: SupplierApprovalDependencies) {
  return async function processSupplierApproval(): Promise<{ checked: number; approved: number }> {
    const supplierIds = await dependencies.listPending(SUPPLIERS_PER_ROUND);
    let approved = 0;
    for (const supplierId of supplierIds) {
      try {
        const status = await dependencies.check(supplierId);
        approved += status === "approved" ? 1 : 0;
      } catch (error) {
        logger.error("supplier_approval.round_check_failed", { supplierId, error });
      }
    }
    if (approved > 0) {
      logger.info("supplier_approval.round_approved", { approved });
    }
    return { checked: supplierIds.length, approved };
  };
}
