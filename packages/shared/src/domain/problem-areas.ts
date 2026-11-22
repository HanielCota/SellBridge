/** Where in the product a recorded problem happened (admin "Problemas"). */
export const PROBLEM_AREAS = [
  "publishing",
  "sync",
  "orders",
  "payments",
  "invoices",
  "email",
  "claims",
  "other",
] as const;
export type ProblemArea = (typeof PROBLEM_AREAS)[number];

export const PROBLEM_AREA_LABELS: Readonly<Record<ProblemArea, string>> = {
  publishing: "Publicação",
  sync: "Sincronização",
  orders: "Pedidos",
  payments: "Pagamento",
  invoices: "Nota fiscal",
  email: "E-mail",
  claims: "Reclamações",
  other: "Outro",
};

/** The process that logged the problem. */
export const PROBLEM_SERVICES = ["web", "worker"] as const;
export type ProblemService = (typeof PROBLEM_SERVICES)[number];

export const PROBLEM_SERVICE_LABELS: Readonly<Record<ProblemService, string>> = {
  web: "Site",
  worker: "Tarefas em segundo plano",
};

/**
 * Problems that are money the team still has to move (a refund Asaas refused, a protected payment
 * no rule decides). While open they are listed whatever the period and never pruned: a refund the
 * reseller waits for must not leave the team's list on its own.
 */
export const MONEY_PROBLEM_EVENTS = [
  "asaas.refund_refused",
  "asaas.held_payment_needs_decision",
  "mercado_pago.refund_refused",
] as const;

const MONEY_PROBLEM_EVENT_SET: ReadonlySet<string> = new Set(MONEY_PROBLEM_EVENTS);

/** Whether the problem is money the team has to give back or decide on. */
export function isMoneyProblem(event: string): boolean {
  return MONEY_PROBLEM_EVENT_SET.has(event);
}
