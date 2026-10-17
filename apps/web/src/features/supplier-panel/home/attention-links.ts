import type {
  SupplierAttentionTarget,
  SupplierOrderFilter,
} from "@sellbridge/shared/supplier-panel-attention";

/**
 * Where each "Precisa de você" item is fixed, as a plain path. The panel's routes are created
 * by the supplier access work; if it mounts the panel elsewhere, only this base changes.
 */
export const SUPPLIER_PANEL_BASE_PATH = "/fornecedor/painel";

/**
 * The Pedidos tab each filter opens (`SUPPLIER_ORDER_TABS` of the orders area): what waits for
 * the accept lands on "Aceitar", the rest on "A fazer", which lists every open parcel.
 */
const ORDER_TABS: Record<SupplierOrderFilter, string> = {
  accept_overdue: "forwarded",
  accept_soon: "forwarded",
  delivery_failed: "forwarded",
  dispatch_overdue: "todo",
  dispatch_soon: "todo",
};

function withSearch(path: string, search: Record<string, string>): string {
  return `${path}?${new URLSearchParams(search).toString()}`;
}

export function supplierAttentionHref(
  target: SupplierAttentionTarget,
  basePath: string = SUPPLIER_PANEL_BASE_PATH,
): string {
  if (target.area === "performance") {
    return withSearch(`${basePath}/desempenho`, { metric: target.metric });
  }
  if (target.area === "stock") {
    const product = target.productId === undefined ? {} : { product: target.productId };
    return withSearch(`${basePath}/estoque`, { filter: target.filter, ...product });
  }
  if (target.area === "catalog") {
    const product = target.productId === undefined ? {} : { product: target.productId };
    return withSearch(`${basePath}/produtos`, { status: target.filter, ...product });
  }
  if (target.shipmentId !== undefined) {
    return `${basePath}/pedidos/${target.shipmentId}`;
  }
  return withSearch(`${basePath}/pedidos`, { tab: ORDER_TABS[target.filter] });
}
