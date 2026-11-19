/**
 * The 15-minute check reads every linked product, so a reading this recent means the stock is
 * following Bling now; an older one (checks failing, Bling disconnected, the NF-e switched off)
 * gives the field back to the supplier.
 */
const FOLLOWING_WINDOW_IN_MS = 60 * 60 * 1000;

/** Whether the product's stock comes from Bling right now, so the form shows it read-only. */
export function isStockFromBling(
  product: { erpProductId: number | null; erpStockReadAt: Date | string | null } | null,
  now: Date,
): boolean {
  if (product === null || product.erpProductId === null || product.erpStockReadAt === null) {
    return false;
  }
  const readAt = new Date(product.erpStockReadAt).getTime();
  if (Number.isNaN(readAt)) {
    return false;
  }
  return now.getTime() - readAt < FOLLOWING_WINDOW_IN_MS;
}
