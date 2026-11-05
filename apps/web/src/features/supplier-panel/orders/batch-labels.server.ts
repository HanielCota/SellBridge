import {
  recordLabelsPrinted,
  recordLabelsWaiting,
  supplierLabelShipments,
} from "@sellbridge/database/repositories";
import { hasMarketplaceCause, LABEL_NOT_READY_CAUSE } from "@sellbridge/marketplaces";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { BatchLabelsInput } from "@sellbridge/shared/supplier-panel-orders-schema";
import { loadMarketplaceLabels } from "@/features/fulfillment/marketplace.server";
import { database } from "@/lib/server/database";
import {
  type BatchLabelsReport,
  type LabelCandidate,
  type LabelFile,
  type LabelItemResult,
  planLabelBatch,
} from "./batch-labels";

const UNEXPECTED_FAILURE = "Não foi possível gerar a etiqueta. Tente de novo.";

/** The reason shown for a refused label; errors that are not the app's own are logged. */
function refusalReason(supplierId: string, error: unknown): string {
  if (isAppError(error)) {
    return error.userMessage;
  }
  logger.error("supplier_panel.batch_label_failed", { supplierId, error });
  return UNEXPECTED_FAILURE;
}

/** One reseller store's labels: its PDF, each parcel's result, and the label records kept. */
async function printStoreLabels(
  supplierId: string,
  group: readonly LabelCandidate[],
): Promise<{ file: LabelFile | null; results: LabelItemResult[] }> {
  const [first] = group;
  if (first === undefined) {
    return { file: null, results: [] };
  }
  const shipmentIdByOrder = new Map(group.map((candidate) => [candidate.orderId, candidate.id]));
  const shipmentOf = (orderId: string) => shipmentIdByOrder.get(orderId) ?? orderId;
  try {
    const batch = await loadMarketplaceLabels(
      first.tenantId,
      group.map((candidate) => candidate.orderId),
    );
    const notReady = batch.refused
      .filter((item) => hasMarketplaceCause(item.error, LABEL_NOT_READY_CAUSE))
      .map((item) => item.orderId);
    await Promise.all([
      recordLabelsPrinted(database, batch.printedOrderIds),
      recordLabelsWaiting(database, notReady),
    ]);
    const results: LabelItemResult[] = [
      ...batch.printedOrderIds.map((orderId) => ({
        shipmentId: shipmentOf(orderId),
        printed: true as const,
      })),
      ...batch.refused.map((item) => ({
        shipmentId: shipmentOf(item.orderId),
        printed: false as const,
        reason: refusalReason(supplierId, item.error),
      })),
    ];
    const file =
      batch.pdf === null
        ? null
        : {
            storeName: first.shopName,
            labelCount: batch.printedOrderIds.length,
            pdfBase64: Buffer.from(batch.pdf).toString("base64"),
          };
    return { file, results };
  } catch (error) {
    const reason = refusalReason(supplierId, error);
    return {
      file: null,
      results: group.map((candidate) => ({ shipmentId: candidate.id, printed: false, reason })),
    };
  }
}

/**
 * The marketplace labels of the selected parcels, one PDF per reseller store (each store has its
 * own Mercado Livre account). Every emitted label is recorded, so the list shows it printed.
 */
export async function printSupplierLabels(input: BatchLabelsInput): Promise<BatchLabelsReport> {
  const candidates = await supplierLabelShipments(database, input.supplierId, input.shipmentIds);
  const plan = planLabelBatch(input.shipmentIds, candidates);
  // One store after the other: each one is a run of marketplace calls of its own.
  const files: LabelFile[] = [];
  const results: LabelItemResult[] = [...plan.refused];
  for (const group of plan.stores) {
    const store = await printStoreLabels(input.supplierId, group);
    results.push(...store.results);
    if (store.file !== null) {
      files.push(store.file);
    }
  }
  const printedCount = results.filter((result) => result.printed).length;
  logger.info("supplier_panel.batch_labels", {
    supplierId: input.supplierId,
    printed: printedCount,
    failed: results.length - printedCount,
  });
  return { files, results, printedCount, failedCount: results.length - printedCount };
}
