import {
  ensureManualStore,
  getSellableProducts,
  listSellableCatalog,
  recordManualOrder,
  type ManualOrderItem,
} from "@sellbridge/database/repositories";
import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { ManualSale } from "@sellbridge/shared/schemas";
import { database } from "@/lib/server/database";
import { requestStockSync } from "@/lib/server/stock-sync";

const PRODUCT_RESULTS = 8;

/** The products a reseller may add to a manual sale, matching what was typed. */
export async function searchManualSaleProducts(tenantId: string, query: string) {
  const page = await listSellableCatalog(
    database,
    tenantId,
    { search: query.trim() === "" ? undefined : query, sort: "title" },
    { page: 1, pageSize: PRODUCT_RESULTS },
  );
  return page.items.map((product) => ({
    id: product.id,
    title: product.title,
    sku: product.sku,
    supplierName: product.supplierName,
    imageUrl: product.imageUrl,
    stock: product.stock,
    costCents: product.costCents,
    suggestedPriceCents: product.suggestedPriceCents,
  }));
}

/** Prices and costs come from the catalog, never from the browser; a product no longer sold stops the sale. */
async function manualOrderItems(tenantId: string, sale: ManualSale): Promise<ManualOrderItem[]> {
  const products = await getSellableProducts(
    database,
    tenantId,
    sale.items.map((item) => item.productId),
  );
  const productsById = new Map(products.map((product) => [product.id, product]));
  return sale.items.map((item) => {
    const product = productsById.get(item.productId);
    if (product === undefined) {
      throw validationError(
        "Um dos produtos não está mais à venda. Tire-o da lista e escolha outro.",
      );
    }
    return {
      supplierProductId: product.id,
      title: product.title,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      costCents: product.costCents,
    };
  });
}

/** Records the sale on the channel's manual store and returns the new order to forward. */
export async function recordManualSale(
  tenantId: string,
  sale: ManualSale,
): Promise<{ orderId: string }> {
  const items = await manualOrderItems(tenantId, sale);
  const storeConnectionId = await ensureManualStore(database, tenantId, sale.channel);
  const result = await recordManualOrder(database, tenantId, storeConnectionId, {
    externalOrderId: sale.externalOrderId,
    buyerName: sale.buyerName,
    orderedAt: new Date(),
    items,
  });
  logger.info("manual_sale.recorded", { orderId: result.orderId, channel: sale.channel });
  if (result.stockMoves > 0) {
    await requestStockSync("manual_sale.stock_sync_deferred");
  }
  return { orderId: result.orderId };
}
