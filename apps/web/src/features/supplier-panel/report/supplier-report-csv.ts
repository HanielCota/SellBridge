import type {
  SupplierProductExportRow,
  SupplierReportItem,
  SupplierReportShipment,
} from "@sellbridge/database/repositories";
import { FULFILLMENT_LABELS } from "@sellbridge/shared/schemas";
import { lateSinceFor } from "@sellbridge/shared/shipment-delay";
import { acceptOutcome, dispatchOutcome } from "@sellbridge/shared/supplier-panel-health";
import { stripAccents } from "@sellbridge/shared/text";
import type { CsvValue } from "@/features/report-kit/csv-file";

/*
 * The supplier's two spreadsheets. What the supplier receives per item (the reseller's cost),
 * never the reseller's sale price or margin; the destination as city and state, never the
 * buyer's name, contact or street (the same as the Pedidos list shows).
 */

export const SUPPLIER_ORDER_HEADERS = [
  "Recebido em",
  "Pedido",
  "Produto",
  "SKU",
  "Quantidade",
  "Valor que você recebe (R$)",
  "Prazo de aceite",
  "Aceito em",
  "Prazo de despacho",
  "Despachado em",
  "No prazo",
  "Rastreio",
  "Situação",
  "Cidade de destino",
  "UF de destino",
] as const;

export const SUPPLIER_PRODUCT_HEADERS = [
  "SKU",
  "Produto",
  "Custo para o revendedor (R$)",
  "Estoque",
  "Disponível",
  "Situação",
  "Motivo da recusa",
  "Revendedores que anunciam",
  "Vendidos no período",
  "Esgotado e ainda anunciado",
] as const;

const STILL_WITH_SUPPLIER = new Set(["forwarded", "accepted", "picking", "ready"]);

/** "Não" when the accept or the dispatch was late, "Sim" when it left on time. */
function onTimeCell(shipment: SupplierReportShipment, now: Date): string {
  const accept = acceptOutcome(shipment, now);
  const dispatch = dispatchOutcome(shipment, now);
  if (accept === "late" || dispatch === "late") {
    return "Não";
  }
  if (dispatch === "on_time") {
    return "Sim";
  }
  return STILL_WITH_SUPPLIER.has(shipment.status) ? "Dentro do prazo" : "";
}

/** The marketplace's dispatch date holds for its whole day; the supplier's own hours, to the minute. */
function dispatchDeadlineCell(shipment: SupplierReportShipment): CsvValue {
  if (shipment.dispatchDeadlineAt !== null) {
    return { day: shipment.dispatchDeadlineAt };
  }
  return { date: lateSinceFor(shipment, "dispatch_overdue") };
}

function statusCell(shipment: SupplierReportShipment): string {
  if (shipment.status === "cancelled" && shipment.cancelledBySupplier) {
    return "Cancelado por você";
  }
  return FULFILLMENT_LABELS[shipment.status];
}

function itemCells(item: SupplierReportItem | null): CsvValue[] {
  if (item === null) {
    return ["", "", null, null];
  }
  const value = item.unitCostCents === null ? null : { cents: item.unitCostCents * item.quantity };
  return [item.title, item.sku, item.quantity, value];
}

function shipmentLine(
  shipment: SupplierReportShipment,
  item: SupplierReportItem | null,
  now: Date,
): CsvValue[] {
  return [
    { date: shipment.receivedAt },
    shipment.externalOrderId,
    ...itemCells(item),
    { date: lateSinceFor(shipment, "accept_overdue") },
    { date: shipment.acceptedAt },
    dispatchDeadlineCell(shipment),
    { date: shipment.shippedAt },
    onTimeCell(shipment, now),
    shipment.trackingCode ?? "",
    statusCell(shipment),
    shipment.destinationCity ?? "",
    shipment.destinationState ?? "",
  ];
}

/** One row per item of each parcel; a parcel without items still gets its line. */
export function supplierOrderRows(
  shipments: readonly SupplierReportShipment[],
  now: Date,
): CsvValue[][] {
  return shipments.flatMap((shipment) => {
    if (shipment.items.length === 0) {
      return [shipmentLine(shipment, null, now)];
    }
    return shipment.items.map((item) => shipmentLine(shipment, item, now));
  });
}

function availableOf(product: SupplierProductExportRow): number {
  return product.stock - product.reservedStock;
}

/** What the reseller sees of the product, in one word, as the Produtos tabs name it. */
export function productSituation(product: SupplierProductExportRow): string {
  if (product.reviewStatus === "rejected") {
    return "Recusado";
  }
  if (product.reviewStatus === "draft") {
    return "Rascunho";
  }
  if (product.reviewStatus === "in_review") {
    return "Em análise";
  }
  if (!product.active) {
    return "Desativado";
  }
  return availableOf(product) <= 0 ? "Esgotado" : "Ativo";
}

function outOfStockListed(product: SupplierProductExportRow): boolean {
  return product.active && availableOf(product) <= 0 && product.publishedListings > 0;
}

export function supplierProductRows(products: readonly SupplierProductExportRow[]): CsvValue[][] {
  return products.map((product) => [
    product.sku,
    product.title,
    { cents: product.costCents },
    product.stock,
    availableOf(product),
    productSituation(product),
    product.rejectionReasons.map((reason) => reason.message).join("; "),
    product.resellers,
    product.soldUnits,
    outOfStockListed(product) ? "Sim" : "Não",
  ]);
}

/** "Malhas São João" → "malhas-sao-joao", for a file name that says whose it is. */
export function supplierFileSlug(name: string): string {
  const slug = stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "fornecedor" : slug;
}
