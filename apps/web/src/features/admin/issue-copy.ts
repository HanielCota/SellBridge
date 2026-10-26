import {
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEPS,
  type CustomerHealth,
  type CustomerIssue,
} from "@sellbridge/shared/customer-health";
import type { CustomerIssueKind } from "@sellbridge/shared/schemas";

/** The heading of each attention tile and of the issue filter. */
export const ISSUE_KIND_LABELS: Record<CustomerIssueKind, string> = {
  store: "Lojas desconectadas",
  listings: "Publicações com erro",
  ticket: "Chamados aguardando",
  onboarding: "Primeiros passos parados",
  cooling: "Vendas em queda",
};

export interface IssueCopy {
  title: string;
  description: string;
  /** Few words for the chip in the customers table. */
  badge: string;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function storeCopy(issue: Extract<CustomerIssue, { kind: "store" }>): IssueCopy {
  const [first] = issue.stores;
  const expired = issue.stores.some((store) => store.status === "expired");
  const description = expired
    ? "O acesso expirou: pedidos e estoque estão parados."
    : "A conexão falhou: pedidos e estoque não sincronizam.";
  if (issue.stores.length === 1 && first) {
    return {
      title: `Reconectar ${first.shopName}`,
      description,
      badge: "Loja desconectada",
    };
  }
  const label = plural(issue.stores.length, "loja desconectada", "lojas desconectadas");
  return { title: label, description, badge: label };
}

function onboardingCopy(issue: Extract<CustomerIssue, { kind: "onboarding" }>): IssueCopy {
  const step = ONBOARDING_STEP_LABELS[issue.nextStep].toLowerCase();
  return {
    title: `Parado em ${issue.completedSteps} de ${ONBOARDING_STEPS.length} passos`,
    description: `Falta: ${step}. Conta criada há ${plural(issue.idleDays, "dia", "dias")}.`,
    badge: `Primeiros passos ${issue.completedSteps}/${ONBOARDING_STEPS.length}`,
  };
}

function coolingCopy(issue: Extract<CustomerIssue, { kind: "cooling" }>): IssueCopy {
  if (issue.reason === "decline") {
    return {
      title: `Pedidos caíram ${issue.dropPercent}%`,
      description: "Comparado aos 30 dias anteriores.",
      badge: `Queda de ${issue.dropPercent}%`,
    };
  }
  return {
    title: `Sem acessar há ${plural(issue.idleDays, "dia", "dias")}`,
    description: "Pode ter desistido ou estar com dificuldade.",
    badge: "Inativo",
  };
}

/** One line about a customer: their most urgent problem, else what is left to set up. */
export function healthHeadline(health: CustomerHealth): string {
  const [issue] = health.issues;
  if (issue) {
    return describeIssue(issue).title;
  }
  if (health.nextStep) {
    return `Próximo passo: ${ONBOARDING_STEP_LABELS[health.nextStep].toLowerCase()}`;
  }
  return "Tudo em dia";
}

export function describeIssue(issue: CustomerIssue): IssueCopy {
  if (issue.kind === "store") {
    return storeCopy(issue);
  }
  if (issue.kind === "listings") {
    const label = plural(issue.count, "publicação com erro", "publicações com erro");
    return { title: label, description: "Veja o motivo e reprocesse.", badge: label };
  }
  if (issue.kind === "ticket") {
    return {
      title: plural(issue.count, "chamado aguardando resposta", "chamados aguardando resposta"),
      description: "O cliente espera um retorno da equipe.",
      badge: plural(issue.count, "chamado", "chamados"),
    };
  }
  if (issue.kind === "onboarding") {
    return onboardingCopy(issue);
  }
  return coolingCopy(issue);
}
