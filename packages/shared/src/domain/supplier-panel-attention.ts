import {
  deliveryFailures,
  outOfStockListed,
  parcelState,
  type DeliveryFailure,
  type OpenShipmentSignal,
  type ParcelState,
  type StockSignal,
} from "./supplier-panel-attention-signals.ts";
import { healthForecastText } from "./supplier-panel-health-forecast.ts";
import { HEALTH_METRIC_LABELS, type HealthMetricKey } from "./supplier-panel-health-metrics.ts";
import type { HealthMetric, SupplierHealth } from "./supplier-panel-health.ts";

export * from "./supplier-panel-attention-signals.ts";

/**
 * The supplier's "Precisa de você" queue, after the reseller's one
 * (`apps/web/src/components/reports/attention-items.ts`): one line per kind of problem, each
 * saying why it matters and where it is fixed, worst first. Nothing a supplier can lose a sale
 * or a level over is left out or buried below a lesser item.
 */

export const ATTENTION_SEVERITIES = ["critical", "warning", "info"] as const;
export type AttentionSeverity = (typeof ATTENTION_SEVERITIES)[number];

export const ATTENTION_SEVERITY_LABELS: Record<AttentionSeverity, string> = {
  critical: "Crítico",
  warning: "Atenção",
  info: "Info",
};

/** A metric still green this few bad orders away from yellow shows up as a heads-up. */
export const NEAR_THRESHOLD_EVENTS = 2;

export type SupplierOrderFilter = ParcelState | "delivery_failed";

/** Where an item is fixed; the web layer turns it into a link of the supplier panel. */
export type SupplierAttentionTarget =
  | { area: "orders"; filter: SupplierOrderFilter; shipmentId?: string }
  | { area: "stock"; filter: "out_of_stock_listed"; productId?: string }
  | { area: "performance"; metric: HealthMetricKey };

export interface SupplierAttentionItem {
  key: string;
  severity: AttentionSeverity;
  title: string;
  /** The reason, in one sentence the supplier can act on. */
  description: string;
  target: SupplierAttentionTarget;
  /** How many orders, products or listings are behind the line. */
  count: number;
}

/** Inside a severity, the order the kinds read in: what costs a sale today comes first. */
const KIND_ORDER = [
  "accept_overdue",
  "dispatch_overdue",
  "delivery_failed-label",
  "out_of_stock",
  "metric",
  "delivery_failed-email",
  "accept_soon",
  "dispatch_soon",
] as const;
type ItemKind = (typeof KIND_ORDER)[number];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const PARCEL_STATES: readonly ParcelState[] = [
  "accept_overdue",
  "dispatch_overdue",
  "accept_soon",
  "dispatch_soon",
];

const PARCEL_COPY: Record<ParcelState, { title: [string, string]; description: string }> = {
  accept_overdue: {
    title: ["pedido com aceite atrasado", "pedidos com aceite atrasado"],
    description: "O prazo de aceite passou. Aceite agora ou avise que não consegue enviar.",
  },
  dispatch_overdue: {
    title: ["pedido com despacho atrasado", "pedidos com despacho atrasado"],
    description: "Passou do prazo de despacho. Envie hoje e informe o rastreio.",
  },
  accept_soon: {
    title: ["pedido para aceitar logo", "pedidos para aceitar logo"],
    description: "O prazo de aceite vence nas próximas horas.",
  },
  dispatch_soon: {
    title: ["pedido para despachar até amanhã", "pedidos para despachar até amanhã"],
    description: "O prazo de despacho vence em menos de 24 horas.",
  },
};

const PARCEL_SEVERITY: Record<ParcelState, AttentionSeverity> = {
  accept_overdue: "critical",
  dispatch_overdue: "critical",
  accept_soon: "warning",
  dispatch_soon: "warning",
};

type Grouped = { kind: ItemKind; item: SupplierAttentionItem };

/** One parcel links straight to it; more link to the filtered list. */
function orderTarget(filter: SupplierOrderFilter, shipmentIds: readonly string[]) {
  const [only] = shipmentIds;
  if (shipmentIds.length === 1 && only !== undefined) {
    return { area: "orders" as const, filter, shipmentId: only };
  }
  return { area: "orders" as const, filter };
}

function parcelItems(signals: readonly OpenShipmentSignal[], now: Date): Grouped[] {
  const states = signals.map((signal) => ({ signal, state: parcelState(signal, now) }));
  return PARCEL_STATES.flatMap((state) => {
    const shipmentIds = states
      .filter((entry) => entry.state === state)
      .map((entry) => entry.signal.shipmentId);
    if (shipmentIds.length === 0) {
      return [];
    }
    const [one, many] = PARCEL_COPY[state].title;
    const item = {
      key: state,
      severity: PARCEL_SEVERITY[state],
      title: plural(shipmentIds.length, one, many),
      description: PARCEL_COPY[state].description,
      target: orderTarget(state, shipmentIds),
      count: shipmentIds.length,
    };
    return [{ kind: state, item }];
  });
}

const FAILURE_COPY: Record<DeliveryFailure, { title: [string, string]; description: string }> = {
  label: {
    title: ["etiqueta não foi gerada", "etiquetas não foram geradas"],
    description: "A etiqueta de envio falhou. Abra o pedido para ver o motivo e gerar outra.",
  },
  email: {
    title: ["aviso de pedido não chegou por e-mail", "avisos de pedido não chegaram por e-mail"],
    description: "O e-mail falhou, mas o pedido está aqui no painel. Confira e aceite.",
  },
};

function failureItems(signals: readonly OpenShipmentSignal[]): Grouped[] {
  return (["label", "email"] as const).flatMap((failure) => {
    const shipmentIds = signals
      .filter((signal) => deliveryFailures(signal).includes(failure))
      .map((signal) => signal.shipmentId);
    if (shipmentIds.length === 0) {
      return [];
    }
    const [one, many] = FAILURE_COPY[failure].title;
    const item = {
      key: `delivery_failed-${failure}`,
      severity: failure === "label" ? ("critical" as const) : ("warning" as const),
      title: plural(shipmentIds.length, one, many),
      description: FAILURE_COPY[failure].description,
      target: orderTarget("delivery_failed", shipmentIds),
      count: shipmentIds.length,
    };
    return [{ kind: `delivery_failed-${failure}` as const, item }];
  });
}

function stockItems(signals: readonly StockSignal[]): Grouped[] {
  const products = outOfStockListed(signals);
  const [only] = products;
  if (only === undefined) {
    return [];
  }
  const listings = products.reduce((total, product) => total + product.activeListings, 0);
  const target =
    products.length === 1
      ? {
          area: "stock" as const,
          filter: "out_of_stock_listed" as const,
          productId: only.productId,
        }
      : { area: "stock" as const, filter: "out_of_stock_listed" as const };
  const item = {
    key: "out_of_stock",
    severity: "critical" as const,
    title: `${plural(products.length, "produto sem estoque", "produtos sem estoque")} em ${plural(listings, "anúncio ativo", "anúncios ativos")}`,
    description:
      "Revendedores ainda vendem esses produtos. Reponha o estoque para não cancelar vendas.",
    target,
    count: products.length,
  };
  return [{ kind: "out_of_stock", item }];
}

function metricSeverity(metric: HealthMetric): AttentionSeverity | null {
  if (metric.level === "red") {
    return "critical";
  }
  if (metric.level === "yellow") {
    return "warning";
  }
  const nearLine =
    metric.level === "green" &&
    metric.forecast.kind === "worsen" &&
    metric.forecast.events <= NEAR_THRESHOLD_EVENTS;
  return nearLine ? "info" : null;
}

const METRIC_TITLE_SUFFIX: Record<AttentionSeverity, string> = {
  critical: "está no vermelho",
  warning: "está no amarelo",
  info: "perto do limite",
};

function metricItems(health: SupplierHealth): Grouped[] {
  return health.metrics.flatMap((metric) => {
    const severity = metricSeverity(metric);
    if (severity === null) {
      return [];
    }
    const item = {
      key: `metric-${metric.key}`,
      severity,
      title: `${HEALTH_METRIC_LABELS[metric.key]} ${METRIC_TITLE_SUFFIX[severity]}`,
      description:
        healthForecastText(metric.key, metric.forecast) ?? "Veja os pedidos que pesaram.",
      target: { area: "performance" as const, metric: metric.key },
      count: 1,
    };
    return [{ kind: "metric" as const, item }];
  });
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };

function compareGrouped(first: Grouped, second: Grouped): number {
  const bySeverity = SEVERITY_RANK[first.item.severity] - SEVERITY_RANK[second.item.severity];
  if (bySeverity !== 0) {
    return bySeverity;
  }
  const byKind = KIND_ORDER.indexOf(first.kind) - KIND_ORDER.indexOf(second.kind);
  if (byKind !== 0) {
    return byKind;
  }
  return first.item.key.localeCompare(second.item.key);
}

export interface SupplierAttentionInput {
  openShipments: readonly OpenShipmentSignal[];
  stock: readonly StockSignal[];
  health: SupplierHealth;
  now: Date;
}

/** Every item of the queue, critical first; the same input always gives the same order. */
export function buildSupplierAttention(input: SupplierAttentionInput): SupplierAttentionItem[] {
  return [
    ...parcelItems(input.openShipments, input.now),
    ...failureItems(input.openShipments),
    ...stockItems(input.stock),
    ...metricItems(input.health),
  ]
    .toSorted(compareGrouped)
    .map((grouped) => grouped.item);
}
