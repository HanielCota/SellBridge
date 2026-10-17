import type { FulfillmentStatus } from "../schemas/fulfillment.ts";
import { isOrderBlocked, SUPPLIER_QUEUE_STATUSES } from "./supplier-panel-orders.ts";

export { BLOCKED_ORDER_STATUSES } from "./supplier-panel-orders.ts";

/**
 * The supplier's Pedidos tabs, in the order they show. "todo" is everything still in its hands;
 * the per-step tabs split it; "problem" gathers what needs a look before it costs a penalty.
 */
export const SUPPLIER_ORDER_TABS = [
  "todo",
  "forwarded",
  "accepted",
  "picking",
  "ready",
  "problem",
  "shipped",
  "closed",
] as const;
export type SupplierOrderTab = (typeof SUPPLIER_ORDER_TABS)[number];

export const SUPPLIER_ORDER_TAB_LABELS: Record<SupplierOrderTab, string> = {
  todo: "A fazer",
  forwarded: "Aceitar",
  accepted: "Separar",
  picking: "Em separação",
  ready: "Despachar",
  problem: "Com problema",
  shipped: "Enviados",
  closed: "Encerrados",
};

/** Parcels settled for the supplier: nothing more to do, kept for the history. */
export const SUPPLIER_CLOSED_STATUSES = [
  "delivered",
  "cancelled",
  "returned",
  "not_delivered",
] as const satisfies readonly FulfillmentStatus[];

/** The statuses each tab lists; "problem" is a condition over the queue, not a status. */
export const SUPPLIER_TAB_STATUSES: Record<SupplierOrderTab, readonly FulfillmentStatus[]> = {
  todo: SUPPLIER_QUEUE_STATUSES,
  forwarded: ["forwarded"],
  accepted: ["accepted"],
  picking: ["picking"],
  ready: ["ready"],
  problem: SUPPLIER_QUEUE_STATUSES,
  shipped: ["shipped"],
  closed: SUPPLIER_CLOSED_STATUSES,
};

/** Queue tabs are sorted by deadline; history tabs by the latest change. */
export function isQueueTab(tab: SupplierOrderTab): boolean {
  return tab !== "shipped" && tab !== "closed";
}

/**
 * Why a parcel sits in "Com problema":
 * - `overdue`: past its accept or dispatch time (the marketplace may already penalize it);
 * - `email_failed`: the order e-mail never reached the supplier (`noteSupplierEmailFailed`);
 * - `order_blocked`: the sale is not released for shipping (pending, cancelled or returned).
 */
export const SUPPLIER_ORDER_PROBLEMS = ["overdue", "email_failed", "order_blocked"] as const;
export type SupplierOrderProblem = (typeof SUPPLIER_ORDER_PROBLEMS)[number];

export const SUPPLIER_ORDER_PROBLEM_LABELS: Record<SupplierOrderProblem, string> = {
  overdue: "Prazo vencido",
  email_failed: "E-mail do pedido não chegou",
  order_blocked: "Venda sem liberação para envio",
};

/** What to do about each problem, said next to it instead of a bare red badge. */
export const SUPPLIER_ORDER_PROBLEM_HINTS: Record<SupplierOrderProblem, string> = {
  overdue: "Avance a etapa agora ou registre uma ocorrência explicando o atraso.",
  email_failed: "O pedido está aqui no painel: siga as etapas normalmente.",
  order_blocked: "Não separe nem envie: fale com o revendedor antes.",
};

export interface ProblemSignals {
  overdue: boolean;
  emailFailed: boolean;
  orderStatus: string;
}

/** Every problem a queue parcel has, the most serious first. */
export function supplierOrderProblems(signals: ProblemSignals): SupplierOrderProblem[] {
  const blocked = isOrderBlocked(signals.orderStatus);
  const found: Record<SupplierOrderProblem, boolean> = {
    order_blocked: blocked,
    overdue: signals.overdue,
    email_failed: signals.emailFailed,
  };
  return (["order_blocked", "overdue", "email_failed"] as const).filter(
    (problem) => found[problem],
  );
}
