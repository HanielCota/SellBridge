import type { SupplierReportShipment } from "@sellbridge/database/repositories";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { acceptOutcome, dispatchOutcome } from "@sellbridge/shared/supplier-panel-health";
import {
  SUPPLIER_TAB_STATUSES,
  type SupplierOrderTab,
} from "@sellbridge/shared/supplier-panel-orders-tabs";
import { baseOf } from "@/features/report-kit/report-format";
import {
  CASES_PER_TAB,
  type ReportAttentionItem,
  type ReportCase,
  type ReportCaseTab,
} from "@/features/report-kit/report-model";
import {
  itemsSummary,
  receivedIn,
  reviewsIn,
  type SupplierReportInput,
} from "./supplier-report-input";
import type { WindowFigures } from "./supplier-report-indicators";

/** A review at or below this many stars is listed for the supplier to look into. */
const LOW_RATING = 3;

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** The Pedidos tab that lists a parcel in this status, so the link finds it by its number. */
function tabOf(status: FulfillmentStatus): SupplierOrderTab {
  const tabs: SupplierOrderTab[] = ["todo", "shipped", "closed"];
  return tabs.find((tab) => SUPPLIER_TAB_STATUSES[tab].includes(status)) ?? "todo";
}

export function orderHref(externalOrderId: string, status: FulfillmentStatus): string {
  const search = new URLSearchParams({ tab: tabOf(status), query: externalOrderId });
  return `/fornecedor/painel/pedidos?${search.toString()}`;
}

function lateShipments(input: SupplierReportInput): SupplierReportShipment[] {
  return receivedIn(input.shipments, input.period).filter(
    (shipment) =>
      acceptOutcome(shipment, input.now) === "late" ||
      dispatchOutcome(shipment, input.now) === "late",
  );
}

function lateWhat(shipment: SupplierReportShipment, now: Date): string {
  const acceptLate = acceptOutcome(shipment, now) === "late";
  const dispatchLate = dispatchOutcome(shipment, now) === "late";
  if (acceptLate && dispatchLate) {
    return "Aceite e despacho atrasados";
  }
  return acceptLate ? "Aceite atrasado" : "Despacho atrasado";
}

function lateCase(shipment: SupplierReportShipment, now: Date): ReportCase {
  const shipped =
    shipment.shippedAt === null
      ? "ainda não despachado"
      : `despachado em ${dateTimeFormatter.format(shipment.shippedAt)}`;
  return {
    id: shipment.shipmentId,
    title: `Pedido ${shipment.externalOrderId}`,
    detail: `${lateWhat(shipment, now)} · ${shipped}`,
    meta: itemsSummary(shipment),
    href: orderHref(shipment.externalOrderId, shipment.status),
  };
}

function cancelledCase(shipment: SupplierReportShipment): ReportCase {
  return {
    id: shipment.shipmentId,
    title: `Pedido ${shipment.externalOrderId}`,
    detail: `Cancelado por você · recebido em ${dateTimeFormatter.format(shipment.receivedAt)}`,
    meta: itemsSummary(shipment),
    href: orderHref(shipment.externalOrderId, shipment.status),
  };
}

function caseTab(key: string, label: string, all: readonly ReportCase[]): ReportCaseTab {
  return {
    key,
    label,
    items: all.slice(0, CASES_PER_TAB),
    more: Math.max(0, all.length - CASES_PER_TAB),
  };
}

function lowRatingCases(input: SupplierReportInput): ReportCase[] {
  return reviewsIn(input.reviews, input.period)
    .filter((review) => review.rating <= LOW_RATING)
    .toSorted((first, second) => first.rating - second.rating)
    .map((review) => ({
      id: review.orderId,
      title: `Pedido ${review.externalOrderId} · ${review.rating} ${review.rating === 1 ? "estrela" : "estrelas"}`,
      detail: review.comment.trim() === "" ? "Sem comentário" : review.comment.trim(),
      meta: `Avaliado em ${dateTimeFormatter.format(review.createdAt)}`,
      href: orderHref(review.externalOrderId, "delivered"),
    }));
}

function outOfStockCases(input: SupplierReportInput): ReportCase[] {
  return input.catalog.outOfStockListed.map((product) => ({
    id: product.productId,
    title: product.title,
    detail: `${product.activeListings} ${product.activeListings === 1 ? "anúncio ativo" : "anúncios ativos"} sem estoque`,
    meta: `SKU ${product.sku}`,
    href: `/fornecedor/painel/produtos?product=${product.productId}`,
  }));
}

export function supplierCases(input: SupplierReportInput): ReportCaseTab[] {
  const cancelled = receivedIn(input.shipments, input.period).filter(
    (shipment) => shipment.cancelledBySupplier,
  );
  return [
    caseTab(
      "atrasados",
      "Atrasados",
      lateShipments(input).map((shipment) => lateCase(shipment, input.now)),
    ),
    caseTab("cancelados", "Cancelados", cancelled.map(cancelledCase)),
    caseTab("notas-baixas", "Notas baixas", lowRatingCases(input)),
    caseTab("esgotados", "Esgotados anunciados", outOfStockCases(input)),
  ];
}

export function supplierAttention(
  input: SupplierReportInput,
  current: WindowFigures,
): { title: string; items: ReportAttentionItem[] } {
  const { catalog } = input;
  return {
    title: "Pontos de atenção",
    items: [
      {
        label: "Atrasados",
        count: lateShipments(input).length,
        base: baseOf(current.received.length, "pedidos recebidos"),
      },
      {
        label: "Cancelados por você",
        count: current.cancellations.cancelled,
        base: baseOf(current.cancellations.settled, "concluídos"),
      },
      {
        label: "Esgotados anunciados",
        count: catalog.outOfStockListed.length,
        base: baseOf(catalog.approved, "produtos à venda"),
      },
      {
        label: "Recusados na revisão",
        count: catalog.rejected.length,
        base: baseOf(catalog.products, "produtos"),
      },
    ],
  };
}
