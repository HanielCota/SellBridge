import { describe, expect, it } from "vitest";
import { SUPPLIER_EMAIL_FAILED_NOTE } from "./forward-notes.ts";
import {
  buildSupplierAttention,
  deliveryFailureOf,
  deliveryFailures,
  outOfStockListed,
  parcelState,
  type OpenShipmentSignal,
  type StockSignal,
} from "./supplier-panel-attention.ts";
import {
  computeSupplierHealth,
  HEALTH_METRIC_DEFINITIONS,
  type HealthMetric,
  type SupplierHealth,
} from "./supplier-panel-health.ts";

const HOUR = 3_600_000;
const NOW = new Date("2026-10-16T15:00:00Z");
const EMAIL_FAILED = SUPPLIER_EMAIL_FAILED_NOTE;

function parcel(
  hoursSinceForward: number,
  overrides: Partial<OpenShipmentSignal> = {},
): OpenShipmentSignal {
  const id = `${hoursSinceForward}-${overrides.status ?? "forwarded"}`;
  return {
    shipmentId: `shipment-${id}`,
    orderId: `order-${id}`,
    externalOrderId: `ML-${id}`,
    status: "forwarded",
    dispatchDeadlineAt: null,
    estimatedDeliveryAt: null,
    shippedAt: null,
    forwardedAt: new Date(NOW.getTime() - hoursSinceForward * HOUR),
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
    systemNotes: [],
    ...overrides,
  };
}

function product(availableStock: number, activeListings: number): StockSignal {
  return {
    productId: `product-${availableStock}-${activeListings}`,
    title: "Camiseta",
    sku: "CAM-1",
    availableStock,
    activeListings,
  };
}

const quietHealth: SupplierHealth = computeSupplierHealth({ shipments: [], reviews: [], now: NOW });

function healthWith(metric: Partial<HealthMetric> & Pick<HealthMetric, "key">): SupplierHealth {
  const full: HealthMetric = {
    definition: HEALTH_METRIC_DEFINITIONS[metric.key],
    value: 0.5,
    sample: 20,
    level: "green",
    previousValue: null,
    trend: null,
    forecast: { kind: "steady" },
    ...metric,
  };
  return { ...quietHealth, metrics: [full] };
}

function queue(input: {
  openShipments?: OpenShipmentSignal[];
  stock?: StockSignal[];
  health?: SupplierHealth;
}) {
  return buildSupplierAttention({
    openShipments: input.openShipments ?? [],
    stock: input.stock ?? [],
    health: input.health ?? quietHealth,
    now: NOW,
  });
}

describe("parcelState", () => {
  it("reads overdue and near deadlines from the supplier's own hours", () => {
    expect(parcelState(parcel(25), NOW)).toBe("accept_overdue");
    expect(parcelState(parcel(21), NOW)).toBe("accept_soon");
    expect(parcelState(parcel(10), NOW)).toBeNull();
    expect(parcelState(parcel(30, { status: "accepted" }), NOW)).toBe("dispatch_soon");
    expect(parcelState(parcel(50, { status: "picking" }), NOW)).toBe("dispatch_overdue");
    expect(parcelState(parcel(2, { status: "accepted" }), NOW)).toBeNull();
  });

  it("warns on the marketplace deadline day without calling it late", () => {
    const today = new Date("2026-10-16T03:00:00Z");
    expect(parcelState(parcel(5, { status: "ready", dispatchDeadlineAt: today }), NOW)).toBe(
      "dispatch_soon",
    );
  });

  it("cannot tell anything without a forward", () => {
    expect(parcelState(parcel(5, { forwardedAt: null }), NOW)).toBeNull();
  });
});

describe("deliveryFailureOf", () => {
  it("recognizes the failed supplier e-mail note", () => {
    expect(deliveryFailureOf(EMAIL_FAILED)).toBe("email");
  });

  it("recognizes a failed label note", () => {
    expect(deliveryFailureOf("A etiqueta falhou no Mercado Livre")).toBe("label");
  });

  it("ignores ordinary notes", () => {
    expect(deliveryFailureOf("Reencaminhado ao fornecedor.")).toBeNull();
    expect(deliveryFailureOf("Etiqueta gerada")).toBeNull();
  });
});

describe("deliveryFailures", () => {
  it("drops a failed e-mail once the supplier accepted, but keeps a failed label", () => {
    const notes = [EMAIL_FAILED, "A etiqueta falhou"];
    expect(deliveryFailures(parcel(1, { systemNotes: notes }))).toEqual(["email", "label"]);
    expect(deliveryFailures(parcel(1, { status: "accepted", systemNotes: notes }))).toEqual([
      "label",
    ]);
  });
});

describe("outOfStockListed", () => {
  it("keeps only products without stock that live listings still show", () => {
    const listed = product(0, 3);
    const oversold = product(-1, 1);
    expect(outOfStockListed([listed, oversold, product(0, 0), product(4, 2)])).toEqual([
      listed,
      oversold,
    ]);
  });
});

describe("buildSupplierAttention", () => {
  it("is empty when everything is in order", () => {
    expect(queue({ openShipments: [parcel(1)], stock: [product(3, 2)] })).toEqual([]);
  });

  it("groups late parcels and links one order straight to it", () => {
    const items = queue({
      openShipments: [parcel(25), parcel(26), parcel(50, { status: "ready" })],
    });
    expect(items.map((item) => [item.key, item.title, item.severity])).toEqual([
      ["accept_overdue", "2 pedidos com aceite atrasado", "critical"],
      ["dispatch_overdue", "1 pedido com despacho atrasado", "critical"],
    ]);
    expect(items[0]?.target).toEqual({ area: "orders", filter: "accept_overdue" });
    expect(items[1]?.target).toEqual({
      area: "orders",
      filter: "dispatch_overdue",
      shipmentId: "shipment-50-ready",
    });
  });

  it("names a near deadline in hours, with no sentence repeating it", () => {
    const items = queue({ openShipments: [parcel(21), parcel(30, { status: "accepted" })] });
    expect(items.map((item) => [item.title, item.description])).toEqual([
      ["1 pedido para aceitar em até 4 h", null],
      ["1 pedido para despachar em até 24 h", null],
    ]);
  });

  it("counts the listings hit by products out of stock", () => {
    const [item] = queue({ stock: [product(0, 3), product(-2, 2), product(5, 9)] });
    expect(item).toMatchObject({
      key: "out_of_stock",
      severity: "critical",
      title: "2 produtos sem estoque em 5 anúncios ativos",
      target: { area: "stock", filter: "out_of_stock_listed" },
      count: 2,
    });
    const [single] = queue({ stock: [product(0, 1)] });
    expect(single?.title).toBe("1 produto sem estoque em 1 anúncio ativo");
    expect(single?.target).toMatchObject({ productId: "product-0-1" });
  });

  it("surfaces failed e-mails and labels on open parcels", () => {
    const items = queue({
      openShipments: [
        parcel(1, { systemNotes: [EMAIL_FAILED, EMAIL_FAILED] }),
        parcel(2, { systemNotes: ["A etiqueta falhou"] }),
      ],
    });
    expect(items.map((item) => [item.key, item.severity, item.count])).toEqual([
      ["delivery_failed-label", "critical", 1],
      ["delivery_failed-email", "warning", 1],
    ]);
    expect(items[1]?.title).toBe("1 e-mail de pedido não enviado");
  });

  it("turns metric levels into severities with the forecast as the reason", () => {
    const red = queue({
      health: healthWith({
        key: "dispatch_on_time",
        level: "red",
        forecast: { kind: "recover", events: 3, toLevel: "yellow" },
      }),
    });
    expect(red[0]).toMatchObject({
      severity: "critical",
      title: "Despacho no prazo em vermelho",
      description: "3 despachos no prazo em sequência e você volta para amarelo.",
      target: { area: "performance", metric: "dispatch_on_time" },
    });
    const yellow = queue({
      health: healthWith({ key: "accept_on_time", level: "yellow", forecast: { kind: "steady" } }),
    });
    expect(yellow[0]).toMatchObject({
      severity: "warning",
      description: "Veja os pedidos que pesaram.",
    });
  });

  it("gives a heads-up only when a green metric is close to the line", () => {
    const near = healthWith({
      key: "supplier_cancellations",
      forecast: { kind: "worsen", events: 2, toLevel: "yellow" },
    });
    expect(queue({ health: near })[0]).toMatchObject({
      severity: "info",
      title: "Cancelamentos por você perto do limite",
    });
    const far = healthWith({
      key: "supplier_cancellations",
      forecast: { kind: "worsen", events: 3, toLevel: "yellow" },
    });
    expect(queue({ health: far })).toEqual([]);
    expect(queue({ health: healthWith({ key: "average_rating", level: "insufficient" }) })).toEqual(
      [],
    );
  });

  it("raises no cancellation item while the parcels are still open", () => {
    const openParcels = Array.from({ length: 12 }, (_, index) => ({
      shipmentId: `open-${index}`,
      orderId: `order-open-${index}`,
      externalOrderId: `ML-open-${index}`,
      status: "accepted" as const,
      dispatchDeadlineAt: null,
      estimatedDeliveryAt: null,
      forwardedAt: new Date(NOW.getTime() - 3 * HOUR),
      acceptWithinHours: 24,
      dispatchWithinHours: 48,
      acceptedAt: new Date(NOW.getTime() - 2 * HOUR),
      shippedAt: null,
      cancelledBySupplier: false,
    }));
    const health = computeSupplierHealth({ shipments: openParcels, reviews: [], now: NOW });
    const keys = queue({ health }).map((item) => item.key);
    expect(keys).not.toContain("metric-supplier_cancellations");
  });

  it("orders critical before warning before info, the same way every time", () => {
    const input = {
      openShipments: [parcel(21), parcel(25), parcel(30, { status: "accepted" })],
      stock: [product(0, 1)],
      health: healthWith({
        key: "dispatch_on_time",
        forecast: { kind: "worsen", events: 1, toLevel: "yellow" },
      }),
    };
    const keys = queue(input).map((item) => item.key);
    expect(keys).toEqual([
      "accept_overdue",
      "out_of_stock",
      "accept_soon",
      "dispatch_soon",
      "metric-dispatch_on_time",
    ]);
    const reversed = {
      ...input,
      openShipments: input.openShipments.toReversed(),
    };
    expect(queue(reversed).map((item) => item.key)).toEqual(keys);
  });

  it("breaks ties between metrics of the same severity by key", () => {
    const health = {
      ...quietHealth,
      metrics: [
        ...healthWith({ key: "dispatch_on_time", level: "yellow" }).metrics,
        ...healthWith({ key: "accept_on_time", level: "yellow" }).metrics,
      ],
    };
    expect(queue({ health }).map((item) => item.key)).toEqual([
      "metric-accept_on_time",
      "metric-dispatch_on_time",
    ]);
  });
});
