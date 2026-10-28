import {
  acceptOutcome,
  dispatchOutcome,
  healthWindows,
  LOW_RATING,
  recordsIn,
  tallyCancellations,
  tallyReturns,
  type HealthInput,
  type HealthMetricKey,
  type ShipmentHealthRecord,
} from "./supplier-panel-health.ts";

/**
 * The plain counts behind each metric of the "Desempenho" page ("2 de 131 pedidos", "tempo
 * médio de aceite 6 h"), over the same current window as the thermometer, so the line under a
 * metric always adds up to its value.
 */
export interface HealthMetricFacts {
  /** Orders (or reviews) that counted in the current window. */
  counted: number;
  /** How many of them went against the metric: late, cancelled, returned or 3 stars or less. */
  against: number;
  /**
   * Mean time from the forward to the accept or to the dispatch; null for the other metrics,
   * or when no parcel reached that step yet.
   */
  averageMilliseconds: number | null;
}

type RecordsInWindow = ReturnType<typeof recordsIn>;

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Time from the forward to a step, for every parcel that reached it after its forward. */
function stepDurations(
  shipments: readonly ShipmentHealthRecord[],
  stepAt: (record: ShipmentHealthRecord) => Date | null,
): number[] {
  return shipments.flatMap((record) => {
    const doneAt = stepAt(record);
    if (doneAt === null || record.forwardedAt === null) {
      return [];
    }
    const duration = doneAt.getTime() - record.forwardedAt.getTime();
    return duration < 0 ? [] : [duration];
  });
}

function deadlineFacts(
  records: RecordsInWindow,
  key: "accept_on_time" | "dispatch_on_time",
  now: Date,
): HealthMetricFacts {
  const outcomeOf = key === "accept_on_time" ? acceptOutcome : dispatchOutcome;
  const outcomes = records.shipments
    .map((record) => outcomeOf(record, now))
    .filter((outcome) => outcome !== "pending");
  const stepAt =
    key === "accept_on_time"
      ? (record: ShipmentHealthRecord) => record.acceptedAt
      : (record: ShipmentHealthRecord) => record.shippedAt;
  return {
    counted: outcomes.length,
    against: outcomes.filter((outcome) => outcome === "late").length,
    averageMilliseconds: mean(stepDurations(records.shipments, stepAt)),
  };
}

function rateFacts(tally: { good: number; counted: number }): HealthMetricFacts {
  return { counted: tally.counted, against: tally.counted - tally.good, averageMilliseconds: null };
}

function factsFor(key: HealthMetricKey, records: RecordsInWindow, now: Date): HealthMetricFacts {
  if (key === "accept_on_time" || key === "dispatch_on_time") {
    return deadlineFacts(records, key, now);
  }
  if (key === "supplier_cancellations") {
    return rateFacts(tallyCancellations(records.shipments));
  }
  if (key === "supplier_returns") {
    return rateFacts(tallyReturns(records.shipments));
  }
  return {
    counted: records.reviews.length,
    against: records.reviews.filter((review) => review.rating <= LOW_RATING).length,
    averageMilliseconds: null,
  };
}

/** The counts of every metric over the thermometer's current window. */
export function supplierHealthFacts(
  input: HealthInput,
): Record<HealthMetricKey, HealthMetricFacts> {
  const records = recordsIn(input, healthWindows(input.now).current);
  const of = (key: HealthMetricKey) => factsFor(key, records, input.now);
  return {
    accept_on_time: of("accept_on_time"),
    dispatch_on_time: of("dispatch_on_time"),
    supplier_cancellations: of("supplier_cancellations"),
    supplier_returns: of("supplier_returns"),
    average_rating: of("average_rating"),
  };
}
