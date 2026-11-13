import {
  tallyCancellations,
  tallyDispatch,
  type ShipmentHealthRecord,
} from "./supplier-panel-health-outcomes.ts";

/**
 * The supplier home's operation numbers for the chosen period: how many parcels left late, how
 * many the supplier cancelled itself and how long a parcel takes from the forward to the
 * dispatch. Each parcel counts by the rules of the "Desempenho" thermometer
 * (`supplier-panel-health-outcomes.ts`), so both screens call the same parcel late.
 */

/** A part of a whole: "3 de 40". `rate` is null when there is nothing to count. */
export interface OperationShare {
  part: number;
  total: number;
  /** Between 0 and 1; null when `total` is zero, never a division by zero. */
  rate: number | null;
}

export interface SupplierOperationRates {
  /** Parcels dispatched after their deadline, among the ones whose deadline already came. */
  lateDispatches: OperationShare;
  /** Parcels the supplier cancelled itself, among the ones whose fate is settled. */
  supplierCancellations: OperationShare;
  /** Mean time from the latest forward to the first "shipped" mark; null when none shipped. */
  averageDispatchMilliseconds: number | null;
  /** How many shipped parcels the mean reads. */
  dispatchedParcels: number;
}

export function operationShare(part: number, total: number): OperationShare {
  if (total <= 0) {
    return { part: 0, total: 0, rate: null };
  }
  return { part, total, rate: part / total };
}

/**
 * Mean milliseconds between the forward and the dispatch. A parcel without a forward or marked
 * shipped before its latest forward (a re-forward after it left) has no time to read.
 */
function averageDispatch(records: readonly ShipmentHealthRecord[]) {
  const durations = records.flatMap((record) => {
    if (record.shippedAt === null || record.forwardedAt === null) {
      return [];
    }
    const duration = record.shippedAt.getTime() - record.forwardedAt.getTime();
    return duration >= 0 ? [duration] : [];
  });
  if (durations.length === 0) {
    return { averageDispatchMilliseconds: null, dispatchedParcels: 0 };
  }
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  return {
    averageDispatchMilliseconds: Math.round(total / durations.length),
    dispatchedParcels: durations.length,
  };
}

/** The operation numbers of the parcels forwarded in the period, read at `now`. */
export function computeOperationRates(
  records: readonly ShipmentHealthRecord[],
  now: Date,
): SupplierOperationRates {
  const dispatch = tallyDispatch(records, now);
  const cancellations = tallyCancellations(records);
  return {
    lateDispatches: operationShare(dispatch.counted - dispatch.good, dispatch.counted),
    supplierCancellations: operationShare(
      cancellations.counted - cancellations.good,
      cancellations.counted,
    ),
    ...averageDispatch(records),
  };
}
