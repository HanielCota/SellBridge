import {
  countSupplierOperationNow,
  getSupplierSalesSummary,
  getSupplierSalesTimeseries,
  listSupplierShipmentHealthRecords,
  type SupplierSalesScope,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { resolvePeriod } from "@sellbridge/shared/period-range";
import { computeOperationRates } from "@sellbridge/shared/supplier-panel-operation";
import { SUPPLIER_SALES_SITUATION_STATUSES } from "@sellbridge/shared/supplier-panel-sales";
import { database } from "@/lib/server/database";
import type { SupplierOperationSearch } from "./operation-search";

/**
 * The home's "Sua operação", for the period alone (the chart's product and situation stay with
 * the chart): the late and cancelled parcels and the dispatch time of the parcels forwarded in
 * the period, what waits for the supplier now, and the sales month by month with their resellers.
 */
export async function loadSupplierOperation(
  supplierId: string,
  search: SupplierOperationSearch,
  now: Date = new Date(),
) {
  const period = resolvePeriod(search, now);
  const sales: SupplierSalesScope = {
    supplierId,
    range: { from: period.from, to: period.to },
    statuses: SUPPLIER_SALES_SITUATION_STATUSES.sold,
  };
  const [records, months, summary, waitingNow] = await Promise.all([
    listSupplierShipmentHealthRecords(database, {
      supplierId,
      since: period.from,
      until: period.to,
    }),
    getSupplierSalesTimeseries(database, sales, "month"),
    getSupplierSalesSummary(database, sales),
    countSupplierOperationNow(database, supplierId, now),
  ]);
  // Counts only: what the home showed, for support to compare with a complaint.
  logger.info("supplier_panel.operation_loaded", {
    supplierId,
    period: search.period,
    parcels: records.length,
    waiting: waitingNow.waiting,
  });
  return {
    rates: computeOperationRates(records, now),
    months,
    resellers: summary.resellers,
    now: waitingNow,
  };
}
