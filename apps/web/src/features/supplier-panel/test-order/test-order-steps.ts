import type { SupplierTestOrderStep } from "@sellbridge/database/repositories";

/** The same steps the database keeps, in order; typed against it so the two never drift. */
export const TEST_ORDER_STEPS = [
  "received",
  "accepted",
  "label_printed",
  "picked",
  "shipped",
  "delivered",
] as const satisfies readonly SupplierTestOrderStep[];

/** What the supplier sees in the timeline, the same words as the real queue. */
const STEP_LABELS: Record<SupplierTestOrderStep, string> = {
  received: "Recebido",
  accepted: "Aceito",
  label_printed: "Etiqueta impressa",
  picked: "Separado",
  shipped: "Enviado",
  delivered: "Entregue",
};

/** The one button for the step the test order is in; null once delivered. */
const NEXT_ACTION: Record<SupplierTestOrderStep, string | null> = {
  received: "Aceitar pedido",
  accepted: "Imprimir etiqueta de teste",
  label_printed: "Marcar como separado",
  picked: "Marcar como enviado",
  shipped: "Marcar como entregue",
  delivered: null,
};

const STEP_DATES = {
  received: "createdAt",
  accepted: "acceptedAt",
  label_printed: "labelPrintedAt",
  picked: "pickedAt",
  shipped: "shippedAt",
  delivered: "deliveredAt",
} as const satisfies Record<SupplierTestOrderStep, string>;

export type TestOrderDates = Record<(typeof STEP_DATES)[SupplierTestOrderStep], Date | null>;

export interface TestOrderTimelineStep {
  step: SupplierTestOrderStep;
  label: string;
  at: Date | null;
}

/** Every step with when the supplier reached it (null while it has not). */
export function testOrderTimeline(order: TestOrderDates): TestOrderTimelineStep[] {
  return TEST_ORDER_STEPS.map((step) => ({
    step,
    label: STEP_LABELS[step],
    at: order[STEP_DATES[step]],
  }));
}

export function testOrderNextAction(step: SupplierTestOrderStep): string | null {
  return NEXT_ACTION[step];
}

export function testOrderStepLabel(step: SupplierTestOrderStep): string {
  return STEP_LABELS[step];
}

/** The posting deadline only matters while the parcel is still with the supplier. */
export function testOrderAwaitsPosting(step: SupplierTestOrderStep): boolean {
  return TEST_ORDER_STEPS.indexOf(step) < TEST_ORDER_STEPS.indexOf("shipped");
}
