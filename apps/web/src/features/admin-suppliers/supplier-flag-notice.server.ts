import { findSupplierContactEmail } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { supplierFlagEmail } from "@sellbridge/shared/supplier-flag-email";
import type { SupplierFlagReason } from "@sellbridge/shared/supplier-flags";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { sendEmail } from "@/lib/server/mailer";

/**
 * E-mails the brand's contact about a flag just applied (no supplier bell in the MVP). Runs after
 * the flag is saved and never undoes it: a failure is logged with ids only.
 */
export async function noticeSupplierFlag(input: {
  supplierId: string;
  reason: SupplierFlagReason;
  activeCount: number;
  deactivated: boolean;
  supplierActive: boolean;
}): Promise<void> {
  try {
    const to = await findSupplierContactEmail(database, input.supplierId);
    if (to === null) {
      logger.info("supplier_flags.notice_no_contact_email", { supplierId: input.supplierId });
      return;
    }
    const panelUrl = new URL("/fornecedor/painel", environment.APP_URL).toString();
    await sendEmail({ to, ...supplierFlagEmail({ ...input, panelUrl }, environment.APP_URL) });
  } catch (error) {
    logger.warn("supplier_flags.notice_failed", { supplierId: input.supplierId, error });
  }
}
