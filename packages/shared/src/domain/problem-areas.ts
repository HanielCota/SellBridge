/** Where in the product a recorded problem happened (admin "Problemas"). */
export const PROBLEM_AREAS = [
  "publishing",
  "sync",
  "orders",
  "payments",
  "invoices",
  "email",
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
  other: "Outro",
};

/** The process that logged the problem. */
export const PROBLEM_SERVICES = ["web", "worker"] as const;
export type ProblemService = (typeof PROBLEM_SERVICES)[number];

export const PROBLEM_SERVICE_LABELS: Readonly<Record<ProblemService, string>> = {
  web: "Site",
  worker: "Tarefas em segundo plano",
};
