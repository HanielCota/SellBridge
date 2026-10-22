import {
  getDirectorySupplier,
  getSupplierReputationStats,
} from "@sellbridge/database/repositories";
import {
  computeSupplierReputation,
  emptyReputationStats,
  SCORE_WINDOW_DAYS,
  type SupplierReputation,
} from "@sellbridge/shared/supplier-score";
import { database } from "@/lib/server/database";

const DAY_MILLISECONDS = 86_400_000;

/**
 * Loads the score window of the suppliers at once and returns a lookup; an id without
 * activity gets the reputation of a supplier nobody reviewed yet.
 */
export async function loadReputations(
  supplierIds: readonly string[],
): Promise<(supplierId: string) => SupplierReputation> {
  const from = new Date(Date.now() - SCORE_WINDOW_DAYS * DAY_MILLISECONDS);
  const stats = await getSupplierReputationStats(database, supplierIds, from);
  return (supplierId) => computeSupplierReputation(stats.get(supplierId) ?? emptyReputationStats());
}

/**
 * Score, rating and reasons of any active supplier, as every reseller reads them. Review
 * comments are left out on purpose: only moderation reads them (`reviews.moderate`).
 */
export async function loadSupplierReputation(
  supplierId: string,
): Promise<{ reputation: SupplierReputation }> {
  const supplier = await getDirectorySupplier(database, supplierId);
  const reputationOf = await loadReputations([supplier.id]);
  return { reputation: reputationOf(supplier.id) };
}
