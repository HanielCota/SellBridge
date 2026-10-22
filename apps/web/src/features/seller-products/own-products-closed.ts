import { forbiddenError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { OWN_PRODUCT_WRITE_MESSAGE } from "@sellbridge/shared/store-supplier";

export type OwnProductAction = "save" | "activate" | "duplicate" | "image_upload";

/**
 * MVP (coordinator decision, 2026-10-22): resellers sell only suppliers' products, so a reseller
 * can no longer create, edit, reactivate or upload images of own products, even by calling the
 * server directly. Archiving and the admin's moderation stay open; nothing is deleted.
 */
export function assertOwnProductsClosed(action: OwnProductAction, tenantId: string): never {
  // The reseller reads a plain message; the log keeps what was received and what was expected.
  logger.warn("seller_products.closed", {
    action,
    tenantId,
    received: "seller",
    expected: "supplier",
  });
  throw forbiddenError(OWN_PRODUCT_WRITE_MESSAGE);
}
