import type { FulfillmentStatus } from "../schemas/fulfillment.ts";

/**
 * Where a parcel's marketplace label stands for the supplier, from the label records kept on the
 * parcel. Only Mercado Livre hands out labels; other channels ship with the supplier's own.
 * - `waiting`: the marketplace said it has not released the label yet;
 * - `pending`: never emitted, still within the dispatch time;
 * - `late`: never emitted and the dispatch time is over;
 * - `printed`: emitted at least once.
 */
export const SUPPLIER_LABEL_STATES = ["waiting", "pending", "late", "printed"] as const;
export type SupplierLabelState = (typeof SUPPLIER_LABEL_STATES)[number];

export const SUPPLIER_LABEL_STATE_LABELS: Record<SupplierLabelState, string> = {
  waiting: "Aguardando o canal",
  pending: "Etiqueta pendente",
  late: "Etiqueta em atraso",
  printed: "Etiqueta impressa",
};

/** The one channel whose label the system emits. */
export const LABEL_MARKETPLACE = "mercado_livre";

/** Steps where the label still matters: once the parcel leaves, it was already used. */
export const LABEL_STATUSES = [
  "forwarded",
  "accepted",
  "picking",
  "ready",
] as const satisfies readonly FulfillmentStatus[];

export interface LabelRecord {
  marketplace: string;
  status: FulfillmentStatus;
  labelPrintCount: number;
  labelWaitingSince: Date | null;
  /** Whether the parcel's next step is past its time. */
  overdue: boolean;
}

/** The label state of a parcel; null when there is no marketplace label to speak of. */
export function supplierLabelState(record: LabelRecord): SupplierLabelState | null {
  const statuses: readonly FulfillmentStatus[] = LABEL_STATUSES;
  if (record.marketplace !== LABEL_MARKETPLACE || !statuses.includes(record.status)) {
    return null;
  }
  if (record.labelPrintCount > 0) {
    return "printed";
  }
  // The marketplace holding the label is not the supplier's delay: it is said first.
  if (record.labelWaitingSince !== null) {
    return "waiting";
  }
  return record.overdue ? "late" : "pending";
}
