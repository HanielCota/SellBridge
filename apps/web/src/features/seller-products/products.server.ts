import {
  ensureSellerCatalog,
  getSellerProduct,
  listAdminCategories,
  reserveShortItems,
  saveSellerProductDraft,
  saveAdminSellerProduct,
} from "@sellbridge/database/repositories";
import { forbiddenError, hasErrorCode } from "@sellbridge/shared/errors";
import type { SellerSaveProductInput } from "@sellbridge/shared/seller-catalog-schemas";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { requestStockSync } from "@/lib/server/stock-sync";

export async function loadSellerProductForm(tenantId: string, productId: string) {
  const source = await ensureSellerCatalog(database, tenantId);
  const product = await getSellerProduct(database, tenantId, productId).catch((error: unknown) => {
    if (hasErrorCode(error, "NOT_FOUND")) return null;
    throw error;
  });
  return { sourceId: source.id, product, categories: await listAdminCategories(database) };
}

export async function propagateSellerProduct(productId: string) {
  try {
    await reserveShortItems(database, [productId]);
  } catch (error) {
    logger.error("seller_products.reserve_failed", { productId, error });
  }
  await requestStockSync("seller_products.sync_deferred");
}

export async function writeSellerProduct(
  tenantId: string,
  input: SellerSaveProductInput,
  admin?: { userId: string; reason: string },
) {
  try {
    const product =
      admin === undefined
        ? await saveSellerProductDraft(database, tenantId, input)
        : await saveAdminSellerProduct(database, {
            ...input,
            tenantId,
            adminId: admin.userId,
            reason: admin.reason,
          });
    await propagateSellerProduct(product.id);
    return { saved: true as const, product };
  } catch (error) {
    if (hasErrorCode(error, "CONFLICT")) return { saved: false as const, conflict: error.message };
    throw error;
  }
}

export function assertOwnerProductWrite(session: { impersonatedBy: string | null }) {
  if (session.impersonatedBy !== null)
    throw forbiddenError(
      "Use a gestão de produtos no painel administrativo e informe o motivo da alteração.",
    );
}
