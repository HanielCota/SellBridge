import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { overdueSince, type ShipmentDelay } from "@sellbridge/shared/shipment-delay";
import type { StatusTone } from "@/components/data/tone-status";
import { carrierEventsOldestFirst, type CarrierTrackingEvent } from "./carrier-tracking";

const HOUR_MILLISECONDS = 3_600_000;
const DAY_MILLISECONDS = 24 * HOUR_MILLISECONDS;

/**
 * How long a parcel marked as sent may wait for the carrier's first scan before the wait is
 * pointed out. Collections and agencies often take a day; two covers a weekend's Friday.
 */
const SCAN_GRACE_HOURS = 48;

/** Where the parcel is now, in the words the screen shows. */
export type ParcelHolder =
  "supplier" | "you" | "collection" | "carrier" | "pickup" | "buyer" | "sender" | "closed";

export const PARCEL_HOLDER_LABELS: Record<ParcelHolder, string> = {
  supplier: "Com o fornecedor",
  you: "Com você",
  collection: "Na coleta ou na agência",
  carrier: "Com a transportadora",
  pickup: "Na agência, esperando o comprador",
  buyer: "Com o comprador",
  sender: "Voltando para o remetente",
  closed: "Envio cancelado",
};

/** What SellBridge knows about a parcel of an order; null for a code typed by hand. */
export interface ParcelFacts {
  status: FulfillmentStatus;
  catalogKind: "seller" | "supplier";
  supplierName: string;
  delay: ShipmentDelay | null;
  acceptBy: Date | null;
  dispatchBy: Date | null;
  dispatchDeadlineAt: Date | null;
  estimatedDeliveryAt: Date | null;
  /** When the parcel was first marked as sent. */
  shippedAt: Date | null;
}

export interface TrackingExplanationInput {
  parcel: ParcelFacts | null;
  /** The carrier's events; null when the carrier could not be read (not connected, offline). */
  carrierEvents: readonly CarrierTrackingEvent[] | null;
  now: Date;
}

export interface TrackingExplanation {
  holder: ParcelHolder;
  tone: StatusTone;
  title: string;
  lines: string[];
}

const DAY_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: REPORT_TIME_ZONE,
});
const TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: REPORT_TIME_ZONE,
});

function day(date: Date): string {
  return DAY_FORMAT.format(date);
}

function dayAndTime(date: Date): string {
  return `${DAY_FORMAT.format(date)} às ${TIME_FORMAT.format(date)}`;
}

function isOwnParcel(parcel: ParcelFacts | null): boolean {
  return parcel?.catalogKind === "seller";
}

/** "O fornecedor" or "Você": who marked the parcel as sent. */
function sender(parcel: ParcelFacts): string {
  return isOwnParcel(parcel) ? "Você" : "O fornecedor";
}

const AT_SUPPLIER: ReadonlySet<FulfillmentStatus> = new Set([
  "forwarded",
  "accepted",
  "picking",
  "ready",
]);

function supplierLate(parcel: ParcelFacts): TrackingExplanation {
  const own = isOwnParcel(parcel);
  const holder = own ? "you" : "supplier";
  if (parcel.delay === "accept_overdue" && parcel.acceptBy !== null) {
    return {
      holder,
      tone: "warning",
      title: "O fornecedor ainda não aceitou o pedido",
      lines: [`O prazo para aceitar era ${dayAndTime(parcel.acceptBy)}.`],
    };
  }
  const deadline = parcel.dispatchBy ?? parcel.dispatchDeadlineAt;
  const deadlineLine = deadline === null ? [] : [`O prazo para enviar era ${day(deadline)}.`];
  return {
    holder,
    tone: "warning",
    title: own ? "Você ainda não enviou o pacote" : "O fornecedor ainda não enviou o pacote",
    lines: [
      ...deadlineLine,
      own ? "O pacote ainda está com você." : "O pacote ainda está com ele.",
    ],
  };
}

/** Still being prepared: late only when the deadline really passed. */
function atSupplier(parcel: ParcelFacts): TrackingExplanation {
  if (parcel.delay === "dispatch_overdue" || parcel.delay === "accept_overdue") {
    return supplierLate(parcel);
  }
  const own = isOwnParcel(parcel);
  const deadline = parcel.dispatchBy ?? parcel.dispatchDeadlineAt;
  const who = own ? "Você tem" : `${parcel.supplierName} tem`;
  const deadlineLine = deadline === null ? [] : [`${who} até ${day(deadline)} para enviar.`];
  return {
    holder: own ? "you" : "supplier",
    tone: "info",
    title: own ? "Em preparação com você" : "Em preparação com o fornecedor",
    lines: [...deadlineLine, "Até aqui, está no prazo."],
  };
}

/** Sent, but the carrier has not scanned it yet. */
function awaitingFirstScan(input: TrackingExplanationInput): TrackingExplanation {
  const shippedAt = input.parcel?.shippedAt ?? null;
  if (input.parcel === null || shippedAt === null) {
    return {
      holder: "collection",
      tone: "info",
      title: "A transportadora ainda não registrou este código",
      lines: ["Quando o pacote for lido (bipado) pela transportadora, os passos aparecem aqui."],
    };
  }
  const waitedHours = (input.now.getTime() - shippedAt.getTime()) / HOUR_MILLISECONDS;
  const sentLine = `${sender(input.parcel)} marcou como enviado em ${day(shippedAt)}.`;
  if (waitedHours <= SCAN_GRACE_HOURS) {
    return {
      holder: "collection",
      tone: "info",
      title: "Esperando a primeira leitura da transportadora",
      lines: [sentLine, "A coleta ou a agência costuma registrar (bipar) o pacote em até 2 dias."],
    };
  }
  return {
    holder: "collection",
    tone: "warning",
    title: "Enviado, mas a transportadora ainda não leu o pacote",
    lines: [
      sentLine,
      "Até agora a transportadora não registrou (bipou) o pacote. Essa espera costuma ser na coleta do marketplace ou na agência.",
    ],
  };
}

/** Sent, with no carrier events to read: the marketplace's estimate is all there is. */
function shippedWithoutCarrier(parcel: ParcelFacts, now: Date): TrackingExplanation {
  const estimate = parcel.estimatedDeliveryAt;
  if (estimate !== null && overdueSince(estimate).getTime() <= now.getTime()) {
    return {
      holder: "carrier",
      tone: "warning",
      title: "A entrega passou da previsão",
      lines: [`A previsão de entrega era ${day(estimate)}.`, ...dispatchOnTimeLines(parcel)],
    };
  }
  const estimateLine = estimate === null ? [] : [`A previsão de entrega é ${day(estimate)}.`];
  return { holder: "carrier", tone: "info", title: "A caminho", lines: estimateLine };
}

/** Whether the sender kept its own deadline, said only when the dates show it. */
function dispatchOnTimeLines(parcel: ParcelFacts | null): string[] {
  if (parcel === null || parcel.shippedAt === null || parcel.dispatchDeadlineAt === null) {
    return [];
  }
  const late = parcel.shippedAt.getTime() >= overdueSince(parcel.dispatchDeadlineAt).getTime();
  if (late) {
    return [`O envio foi feito depois do prazo, que era ${day(parcel.dispatchDeadlineAt)}.`];
  }
  return [`${sender(parcel)} enviou dentro do prazo.`];
}

/** The carrier's first scan came long after the parcel was marked as sent. */
function slowScanLines(parcel: ParcelFacts | null, events: CarrierTrackingEvent[]): string[] {
  const firstScan = events[0];
  if (parcel === null || parcel.shippedAt === null || firstScan === undefined) {
    return [];
  }
  const waited = firstScan.at.getTime() - parcel.shippedAt.getTime();
  if (waited <= SCAN_GRACE_HOURS * HOUR_MILLISECONDS) {
    return [];
  }
  const days = Math.round(waited / DAY_MILLISECONDS);
  return [
    `${sender(parcel)} marcou como enviado em ${day(parcel.shippedAt)}, mas a transportadora só registrou (bipou) o pacote em ${day(firstScan.at)}, ${days} dias depois. Essa espera costuma ser na coleta do marketplace ou na agência.`,
  ];
}

const NOT_THE_SUPPLIER = "Essa etapa não depende do fornecedor.";

function notTheSupplier(parcel: ParcelFacts | null): string[] {
  return parcel?.catalogKind === "supplier" ? [NOT_THE_SUPPLIER] : [];
}

function placeSuffix(event: CarrierTrackingEvent): string {
  return event.place === null ? "" : `, em ${event.place}`;
}

/** The carrier's latest step decides when it is final (delivered, failed, returning, pickup). */
function settledByCarrier(
  last: CarrierTrackingEvent,
  parcel: ParcelFacts | null,
): TrackingExplanation | null {
  if (last.kind === "delivered") {
    return {
      holder: "buyer",
      tone: "success",
      title: "Pedido entregue",
      lines: [`Entregue em ${day(last.at)}${placeSuffix(last)}.`],
    };
  }
  if (last.kind === "returning") {
    return {
      holder: "sender",
      tone: "danger",
      title: "O pacote está voltando para o remetente",
      lines: [
        `A transportadora começou a devolução em ${day(last.at)}. Isso costuma acontecer depois de tentativas de entrega sem sucesso ou quando o pacote não é retirado.`,
        ...notTheSupplier(parcel),
      ],
    };
  }
  if (last.kind === "delivery_failed") {
    return {
      holder: "carrier",
      tone: "warning",
      title: "A entrega não deu certo",
      lines: [
        `A transportadora tentou entregar em ${dayAndTime(last.at)}: ${last.description}`,
        ...notTheSupplier(parcel),
      ],
    };
  }
  if (last.kind === "awaiting_pickup") {
    return {
      holder: "pickup",
      tone: "info",
      title: "Esperando o comprador retirar",
      lines: [`O pacote chegou na agência${placeSuffix(last)} em ${day(last.at)}.`],
    };
  }
  return null;
}

/** Moving with the carrier: late against the estimate, out for delivery, or on its way. */
function movingWithCarrier(
  last: CarrierTrackingEvent,
  parcel: ParcelFacts | null,
  now: Date,
): TrackingExplanation {
  const estimate = parcel?.estimatedDeliveryAt ?? null;
  const lastLine = `Última atualização: ${last.description}${placeSuffix(last)}, ${day(last.at)}.`;
  if (estimate !== null && overdueSince(estimate).getTime() <= now.getTime()) {
    return {
      holder: "carrier",
      tone: "warning",
      title: "Entrega atrasada na transportadora",
      lines: [
        `A previsão de entrega era ${day(estimate)}.`,
        lastLine,
        ...dispatchOnTimeLines(parcel),
      ],
    };
  }
  const estimateLine = estimate === null ? [] : [`A previsão de entrega é ${day(estimate)}.`];
  const title =
    last.kind === "out_for_delivery" ? "Saiu para entrega" : "A caminho com a transportadora";
  return { holder: "carrier", tone: "info", title, lines: [lastLine, ...estimateLine] };
}

/** SellBridge's own final statuses, when the carrier has nothing newer to say. */
function settledInSellBridge(parcel: ParcelFacts): TrackingExplanation | null {
  if (parcel.status === "cancelled") {
    return { holder: "closed", tone: "muted", title: "Envio cancelado", lines: [] };
  }
  if (parcel.status === "delivered") {
    return { holder: "buyer", tone: "success", title: "Pedido entregue", lines: [] };
  }
  if (parcel.status === "returned") {
    return { holder: "sender", tone: "danger", title: "Pacote devolvido", lines: [] };
  }
  if (parcel.status === "not_delivered") {
    return {
      holder: "carrier",
      tone: "warning",
      title: "A entrega não deu certo",
      lines: ["O marketplace informou um problema na entrega.", ...notTheSupplier(parcel)],
    };
  }
  return null;
}

function withoutCarrierEvents(input: TrackingExplanationInput): TrackingExplanation {
  const parcel = input.parcel;
  if (parcel !== null && AT_SUPPLIER.has(parcel.status)) {
    return atSupplier(parcel);
  }
  if (parcel !== null && input.carrierEvents === null) {
    return shippedWithoutCarrier(parcel, input.now);
  }
  return awaitingFirstScan(input);
}

/**
 * Who has the parcel now and whose step is late, in plain words: the supplier, the collection,
 * the carrier or the buyer. The supplier is named as late only when its own deadline passed.
 */
export function explainTracking(input: TrackingExplanationInput): TrackingExplanation {
  const settled = input.parcel === null ? null : settledInSellBridge(input.parcel);
  const events = carrierEventsOldestFirst(input.carrierEvents ?? []);
  const last = events.at(-1);
  if (input.parcel?.status === "cancelled" && settled !== null) {
    return settled;
  }
  if (last === undefined) {
    return settled ?? withoutCarrierEvents(input);
  }
  // A final status from the marketplace beats a carrier that still reads "in transit".
  const explanation =
    settledByCarrier(last, input.parcel) ??
    settled ??
    movingWithCarrier(last, input.parcel, input.now);
  return { ...explanation, lines: [...explanation.lines, ...slowScanLines(input.parcel, events)] };
}
