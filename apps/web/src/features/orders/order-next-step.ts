import { formatCents } from "@sellbridge/shared/money";
import type { PreparationHold } from "@sellbridge/shared/receiving-rules";
import type { FulfillmentStatus, OrderStatus } from "@sellbridge/shared/schemas";
import { formatDeadline, formatSmartDate } from "@/lib/relative-time";

/** What the reseller can do from the next-step card: jump to the forward form or to a payment. */
export type NextStepAction =
  | { kind: "forward"; label: string }
  | { kind: "pay"; shipmentId: string }
  | { kind: "reforward"; shipmentId: string };

/** How the card reads: something to do now, something to wait for, or nothing left. */
export type NextStepTone = "action" | "waiting" | "done" | "problem";

export interface OrderNextStep {
  tone: NextStepTone;
  title: string;
  detail: string | null;
  action: NextStepAction | null;
}

export interface NextStepItem {
  catalogKind: "seller" | "supplier" | null;
  supplierId: string | null;
  supplierName: string | null;
  quantity: number;
  unitCostCents: number;
}

export interface NextStepShipment {
  id: string;
  status: FulfillmentStatus;
  catalogKind: "seller" | "supplier";
  supplierName: string;
  preparationHold: PreparationHold | null;
  forwardedAt: Date | null;
  acceptBy: Date | null;
  dispatchBy: Date | null;
}

export interface NextStepInput {
  orderStatus: OrderStatus;
  items: readonly NextStepItem[];
  shipments: readonly NextStepShipment[];
  now: Date;
}

/** What the reseller will pay the suppliers once the order is sent: their items' cost. */
export function supplierCostCents(items: readonly NextStepItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.catalogKind !== "supplier" || item.supplierId === null) {
      continue;
    }
    total += item.unitCostCents * item.quantity;
  }
  return total;
}

function supplierNamesOf(items: readonly NextStepItem[]): string[] {
  const names = new Set<string>();
  for (const item of items) {
    if (item.catalogKind === "supplier" && item.supplierName !== null) {
      names.add(item.supplierName);
    }
  }
  return [...names];
}

/** "Depois você paga R$ 21,16 ao fornecedor…"; null when there is no supplier cost to tell. */
export function payLaterSentence(items: readonly NextStepItem[]): string | null {
  const cents = supplierCostCents(items);
  if (cents <= 0) {
    return null;
  }
  const whom = supplierNamesOf(items).length > 1 ? "aos fornecedores" : "ao fornecedor";
  return `Depois você paga ${formatCents(cents)} ${whom}, por Pix ou cartão, aqui no pedido.`;
}

function beforeForwarding(input: NextStepInput): OrderNextStep {
  const hasSupplierItems = input.items.some((item) => item.catalogKind === "supplier");
  if (!hasSupplierItems) {
    return {
      tone: "action",
      title: "Falta preparar o envio",
      detail: "Os produtos são seus: você prepara e envia.",
      action: { kind: "forward", label: "Preparar o envio" },
    };
  }
  return {
    tone: "action",
    title: "Falta enviar ao fornecedor",
    detail: payLaterSentence(input.items),
    action: { kind: "forward", label: "Enviar ao fornecedor" },
  };
}

const STAGE_ORDER: readonly FulfillmentStatus[] = [
  "cancelled",
  "not_delivered",
  "forwarded",
  "accepted",
  "picking",
  "ready",
  "shipped",
  "delivered",
  "returned",
];

/** The parcel furthest behind: the one the order is waiting on. */
function slowestShipment(shipments: readonly NextStepShipment[]): NextStepShipment | undefined {
  return shipments.toSorted(
    (left, right) => STAGE_ORDER.indexOf(left.status) - STAGE_ORDER.indexOf(right.status),
  )[0];
}

function whoseParcel(shipment: NextStepShipment): string {
  return shipment.catalogKind === "seller" ? "seu envio" : shipment.supplierName;
}

function waitingForSupplier(shipment: NextStepShipment, now: Date): OrderNextStep {
  if (shipment.preparationHold === "receiving_account") {
    return {
      tone: "waiting",
      title: "Esperando o fornecedor cadastrar onde recebe",
      detail: `Você ainda não precisa pagar. O pedido segue quando a conta de ${shipment.supplierName} for aprovada.`,
      action: null,
    };
  }
  const sentAt =
    shipment.forwardedAt === null ? "" : ` · ${formatSmartDate(shipment.forwardedAt, now)}`;
  const until = shipment.acceptBy === null ? "" : ` até ${formatDeadline(shipment.acceptBy, now)}`;
  return {
    tone: "waiting",
    title: `Enviado ao fornecedor${sentAt}`,
    detail: `Esperando ${shipment.supplierName} aceitar${until}.`,
    action: null,
  };
}

function parcelStep(
  shipment: NextStepShipment,
  orderStatus: OrderStatus,
  now: Date,
): OrderNextStep {
  const status = shipment.status;
  if (status === "cancelled") {
    return {
      tone: "problem",
      title: "O envio foi cancelado",
      detail:
        orderStatus === "paid"
          ? `Reencaminhe o pedido para ${whoseParcel(shipment)} no bloco Envio.`
          : null,
      action: orderStatus === "paid" ? { kind: "reforward", shipmentId: shipment.id } : null,
    };
  }
  if (status === "not_delivered") {
    return {
      tone: "problem",
      title: "Problema na entrega",
      detail: "Veja o que aconteceu no bloco Envio e fale com o fornecedor ou com a equipe.",
      action: null,
    };
  }
  if (status === "forwarded" && shipment.catalogKind === "supplier") {
    return waitingForSupplier(shipment, now);
  }
  if (status === "shipped") {
    return { tone: "waiting", title: "A caminho do comprador", detail: null, action: null };
  }
  if (status === "delivered") {
    return { tone: "done", title: "Entregue ao comprador", detail: null, action: null };
  }
  if (status === "returned") {
    return { tone: "done", title: "Pedido devolvido", detail: null, action: null };
  }
  if (shipment.catalogKind === "seller") {
    return {
      tone: "action",
      title: "Falta preparar seu envio",
      detail: "Avance cada etapa no bloco Envio.",
      action: null,
    };
  }
  const until =
    shipment.dispatchBy === null
      ? ""
      : ` Postagem até ${formatDeadline(shipment.dispatchBy, now)}.`;
  return {
    tone: "waiting",
    title: `${shipment.supplierName} está preparando`,
    detail: `Nada a fazer agora.${until}`,
    action: null,
  };
}

/** A parcel only moves after the reseller pays it: that comes before any waiting. */
function paymentDue(input: NextStepInput): OrderNextStep | null {
  const unpaid = input.shipments.find((shipment) => shipment.preparationHold === "payment");
  if (unpaid === undefined) {
    return null;
  }
  return {
    tone: "action",
    title: "Falta pagar o fornecedor",
    detail: `${unpaid.supplierName} só começa a preparar depois do pagamento.`,
    action: { kind: "pay", shipmentId: unpaid.id },
  };
}

/**
 * Where the order stands and what comes next, for the card at the top of the order page: the
 * reseller sees without scrolling whether the order waits for them.
 */
export function orderNextStep(input: NextStepInput): OrderNextStep {
  if (input.orderStatus === "pending") {
    return {
      tone: "waiting",
      title: "Espere o comprador pagar",
      detail: "Quando o pagamento for confirmado, o botão para enviar ao fornecedor aparece aqui.",
      action: null,
    };
  }
  if (input.shipments.length === 0) {
    if (input.orderStatus === "cancelled") {
      return {
        tone: "done",
        title: "Venda cancelada",
        detail: "Não há nada a enviar.",
        action: null,
      };
    }
    if (input.orderStatus === "returned") {
      return { tone: "done", title: "Pedido devolvido", detail: null, action: null };
    }
    if (input.orderStatus === "paid") {
      return beforeForwarding(input);
    }
    return {
      tone: "done",
      title: "Enviado fora do SellBridge",
      detail: "Este pedido não passou pelo fornecedor aqui.",
      action: null,
    };
  }
  if (input.orderStatus === "cancelled") {
    return {
      tone: "done",
      title: "Venda cancelada",
      detail: "Veja no bloco Envio o que acontece com cada pacote.",
      action: null,
    };
  }
  const payment = paymentDue(input);
  if (payment !== null) {
    return payment;
  }
  const slowest = slowestShipment(input.shipments);
  if (slowest === undefined) {
    throw new Error(`Order with ${input.shipments.length} shipments has no slowest one`);
  }
  return parcelStep(slowest, input.orderStatus, input.now);
}
