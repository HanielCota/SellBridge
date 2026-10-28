import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import {
  SUPPLIER_TAB_STATUSES,
  type SupplierOrderTab,
} from "@sellbridge/shared/supplier-panel-orders-tabs";
import type { HealthMetric, HealthMetricKey } from "@sellbridge/shared/supplier-panel-health";
import type { HealthMetricFacts } from "@sellbridge/shared/supplier-panel-health-facts";
import { formatHealthValue, healthDelta, type HealthDelta } from "../home/health-format";

/**
 * The words of the "Desempenho" page: durations, counts and the line under each metric. Pure,
 * so every sentence a supplier reads is checked by a test.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "40 min", "6 h 40 min", "1 dia e 9 h", "2 dias": rounded to the minute, two units at most. */
export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / MINUTE));
  const days = Math.floor(totalMinutes / (DAY / MINUTE));
  const hours = Math.floor((totalMinutes % (DAY / MINUTE)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    const dayText = plural(days, "dia", "dias");
    return hours === 0 ? dayText : `${dayText} e ${hours} h`;
  }
  if (hours === 0) {
    return `${minutes} min`;
  }
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** The supplier's own time: "24 horas", or "2 dias" when it is whole days past one day. */
export function formatDeadlineHours(hours: number): string {
  if (hours > 24 && hours % 24 === 0) {
    return plural(hours / 24, "dia", "dias");
  }
  return plural(hours, "hora", "horas");
}

/** What the count beside the group's title calls each order. */
const COUNT_NOUNS: Record<HealthMetricKey, readonly [string, string]> = {
  accept_on_time: ["atrasado", "atrasados"],
  dispatch_on_time: ["atrasado", "atrasados"],
  supplier_cancellations: ["cancelado", "cancelados"],
  supplier_returns: ["devolvido", "devolvidos"],
  average_rating: ["nota baixa", "notas baixas"],
};

/** "9 atrasados", "1 nota baixa". */
export function againstCountLabel(key: HealthMetricKey, count: number): string {
  const [one, many] = COUNT_NOUNS[key];
  return plural(count, one, many);
}

/** "Ver os 9 pedidos", "Ver as 4 avaliações". */
export function seeAllLabel(key: HealthMetricKey, count: number): string {
  if (key === "average_rating") {
    return `Ver as ${plural(count, "avaliação", "avaliações")}`;
  }
  return `Ver os ${plural(count, "pedido", "pedidos")}`;
}

/** One figure of the line under the group's title: "Agora 82% ↓ 4 p.p.", "Seu prazo 24 horas". */
export interface PerformanceFact {
  label: string;
  value: string;
  delta: HealthDelta | null;
}

function nowFact(metric: HealthMetric): PerformanceFact {
  if (metric.level === "insufficient") {
    return { label: "Agora", value: "sem dados", delta: null };
  }
  return {
    label: "Agora",
    value: formatHealthValue(metric.definition, metric.value),
    delta: healthDelta(metric),
  };
}

interface FactsInput {
  metric: HealthMetric;
  facts: HealthMetricFacts;
  deadlines: { acceptWithinHours: number | null; dispatchWithinHours: number | null };
}

function averageFact(label: string, facts: HealthMetricFacts): PerformanceFact[] {
  if (facts.averageMilliseconds === null) {
    return [];
  }
  return [{ label, value: formatDuration(facts.averageMilliseconds), delta: null }];
}

function deadlineFact(hours: number | null): PerformanceFact[] {
  if (hours === null) {
    return [];
  }
  return [{ label: "Seu prazo", value: formatDeadlineHours(hours), delta: null }];
}

function countFact(label: string, facts: HealthMetricFacts, noun: string): PerformanceFact {
  return { label, value: `${facts.against} de ${facts.counted} ${noun}`, delta: null };
}

/** The figures beside "Agora", per metric. */
function detailFacts({ metric, facts, deadlines }: FactsInput): PerformanceFact[] {
  if (metric.key === "accept_on_time") {
    return [
      ...averageFact("Tempo médio de aceite", facts),
      ...deadlineFact(deadlines.acceptWithinHours),
    ];
  }
  if (metric.key === "dispatch_on_time") {
    return [
      ...averageFact("Tempo médio de despacho", facts),
      ...deadlineFact(deadlines.dispatchWithinHours),
    ];
  }
  if (metric.key === "supplier_cancellations") {
    return [countFact("Cancelados por você", facts, "pedidos")];
  }
  if (metric.key === "supplier_returns") {
    return [countFact("Devolvidos", facts, "entregues")];
  }
  return [countFact("Com 3 estrelas ou menos", facts, "avaliações")];
}

export function performanceFacts(input: FactsInput): PerformanceFact[] {
  return [nowFact(input.metric), ...detailFacts(input)];
}

/** What sits on the right of each order: the delay, or what happened to the parcel. */
export function orderOutcomeText(key: HealthMetricKey, lateByMilliseconds: number | null): string {
  if (key === "supplier_cancellations") {
    return "Cancelado por você";
  }
  if (key === "supplier_returns") {
    return "Devolvido";
  }
  if (lateByMilliseconds === null) {
    return "Fora do prazo";
  }
  return `Atraso de ${formatDuration(lateByMilliseconds)}`;
}

/** The Pedidos tab that lists a parcel in this status: open ones in "A fazer". */
export function ordersTabOf(status: FulfillmentStatus): SupplierOrderTab {
  if (SUPPLIER_TAB_STATUSES.shipped.includes(status)) {
    return "shipped";
  }
  if (SUPPLIER_TAB_STATUSES.closed.includes(status)) {
    return "closed";
  }
  return "todo";
}
