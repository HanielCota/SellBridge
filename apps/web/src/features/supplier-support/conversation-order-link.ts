import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import {
  SUPPLIER_TAB_STATUSES,
  type SupplierOrderTab,
} from "@sellbridge/shared/supplier-panel-orders-tabs";
import { SUPPLIER_PANEL_BASE_PATH } from "@/features/supplier-panel/home/attention-links";

/** The tabs that list a parcel by its status alone, from the first to the last step. */
const TABS_BY_STATUS: readonly SupplierOrderTab[] = ["todo", "shipped", "closed"];

/** The Pedidos tab that lists a parcel in this status: the queue, Enviados or Encerrados. */
export function supplierOrderTabOf(status: FulfillmentStatus): SupplierOrderTab {
  const tab = TABS_BY_STATUS.find((candidate) => SUPPLIER_TAB_STATUSES[candidate].includes(status));
  if (tab === undefined) {
    throw new Error(`No supplier order tab lists the status "${status}"`);
  }
  return tab;
}

/**
 * "Ver pedido" from a conversation: the supplier's Pedidos on the tab that holds the parcel,
 * already searched by the order number. Null when the supplier has no parcel of that order.
 */
export function supplierOrderHref(order: {
  externalOrderId: string;
  shipmentStatus: FulfillmentStatus | null;
}): string | null {
  if (order.shipmentStatus === null) {
    return null;
  }
  const search = new URLSearchParams({
    tab: supplierOrderTabOf(order.shipmentStatus),
    query: order.externalOrderId,
  });
  return `${SUPPLIER_PANEL_BASE_PATH}/pedidos?${search.toString()}`;
}
