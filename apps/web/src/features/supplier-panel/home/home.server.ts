import {
  getSupplierPanelProfile,
  getSupplierReputationStats,
  listSupplierHealthDrillDown,
  listSupplierOpenShipments,
  listSupplierOutOfStockListed,
  loadSupplierHealthInput,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  buildSupplierAttention,
  type SupplierAttentionItem,
} from "@sellbridge/shared/supplier-panel-attention";
import {
  computeSupplierHealth,
  type HealthDrillDownRow,
  type HealthMetricKey,
  type SupplierHealth,
} from "@sellbridge/shared/supplier-panel-health";
import {
  computeSupplierReputation,
  emptyReputationStats,
  SCORE_WINDOW_DAYS,
  type SupplierReputation,
} from "@sellbridge/shared/supplier-score";
import { daysBefore } from "@sellbridge/shared/time";
import { database } from "@/lib/server/database";

/** The public score resellers see (90 days), next to the supplier's own 60-day thermometer. */
async function loadPublicReputation(supplierId: string, now: Date): Promise<SupplierReputation> {
  const stats = await getSupplierReputationStats(
    database,
    [supplierId],
    daysBefore(SCORE_WINDOW_DAYS, now),
  );
  return computeSupplierReputation(stats.get(supplierId) ?? emptyReputationStats());
}

export interface SupplierPerformance {
  supplierName: string;
  health: SupplierHealth;
  reputation: SupplierReputation;
}

/** Thermometer and public score of the "Desempenho" page. */
export async function loadSupplierPerformance(supplierId: string): Promise<SupplierPerformance> {
  const now = new Date();
  const [profile, healthInput, reputation] = await Promise.all([
    getSupplierPanelProfile(database, supplierId),
    loadSupplierHealthInput(database, { supplierId, now }),
    loadPublicReputation(supplierId, now),
  ]);
  return { supplierName: profile.name, health: computeSupplierHealth(healthInput), reputation };
}

export interface SupplierHome {
  supplierName: string;
  attention: SupplierAttentionItem[];
  health: SupplierHealth;
}

/** The "Início" page: the queue of what needs the supplier, and the four health tiles. */
export async function loadSupplierHome(supplierId: string): Promise<SupplierHome> {
  const now = new Date();
  const [profile, healthInput, openShipments, stock] = await Promise.all([
    getSupplierPanelProfile(database, supplierId),
    loadSupplierHealthInput(database, { supplierId, now }),
    listSupplierOpenShipments(database, supplierId),
    listSupplierOutOfStockListed(database, supplierId),
  ]);
  const health = computeSupplierHealth(healthInput);
  const attention = buildSupplierAttention({ openShipments, stock, health, now });
  // Ids and counts only: what the queue showed, for support to compare with a complaint.
  logger.info("supplier_panel.home_loaded", {
    supplierId,
    attentionItems: attention.length,
    critical: attention.filter((item) => item.severity === "critical").length,
  });
  return { supplierName: profile.name, attention, health };
}

/** The orders of the last 60 days that count against one metric. */
export async function loadHealthDrillDown(
  supplierId: string,
  metric: HealthMetricKey,
): Promise<HealthDrillDownRow[]> {
  await getSupplierPanelProfile(database, supplierId);
  return listSupplierHealthDrillDown(database, { supplierId, metric, now: new Date() });
}
