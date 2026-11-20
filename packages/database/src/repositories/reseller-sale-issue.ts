import type { BillingAddress } from "@sellbridge/shared/billing-address";
import type { ResellerBlingSettings } from "@sellbridge/shared/reseller-bling";
import type { DeliveryAddress } from "@sellbridge/shared/schemas";
import {
  readSupplierFiscalProfile,
  type SupplierFiscalProfile,
} from "@sellbridge/shared/supplier-fiscal";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  orders,
  orderShipments,
  shipmentResellerInvoices,
  storeConnections,
  suppliers,
  tenantProfile,
} from "../schema/index.ts";
import { findResellerErpConnection } from "./reseller-erp-connections.ts";
import { parcelInvoiceLines, type ShipmentInvoiceLine } from "./shipment-invoices.ts";

/** Everything the reseller's ERP needs to issue the parcel's sale note to the buyer. */
export interface ResellerSaleIssueWork {
  readonly invoiceId: string;
  readonly tenantId: string;
  readonly externalOrderId: string;
  readonly orderedAt: Date;
  /** Where the parcel goes: the buyer's address on the note. */
  readonly address: DeliveryAddress;
  /** Each line at the buyer's price, with the product's fiscal data. */
  readonly lines: readonly ShipmentInvoiceLine[];
  /** The supplier's defaults fill a product's missing NCM, origin or unit; null when unset. */
  readonly supplierFiscal: SupplierFiscalProfile | null;
  /** The reseller's company address (its state picks the CFOP); null when it was never asked. */
  readonly resellerAddress: BillingAddress | null;
  /** Null when the reseller has not saved them since connecting. */
  readonly settings: ResellerBlingSettings | null;
  readonly store: {
    readonly id: string;
    readonly marketplace: string;
    readonly externalShopId: string;
    readonly accessTokenEnc: string | null;
  };
}

/** The note's work, or null when its parcel is gone. */
export async function loadResellerSaleIssueWork(
  database: Database,
  invoiceId: string,
): Promise<ResellerSaleIssueWork | null> {
  const [row] = await database
    .select({
      tenantId: shipmentResellerInvoices.tenantId,
      orderId: orders.id,
      externalOrderId: orders.externalOrderId,
      orderedAt: orders.orderedAt,
      address: orderShipments.address,
      items: orderShipments.items,
      supplierFiscal: suppliers.fiscalProfile,
      resellerAddress: tenantProfile.billingAddress,
      store: {
        id: storeConnections.id,
        marketplace: storeConnections.marketplace,
        externalShopId: storeConnections.externalShopId,
        accessTokenEnc: storeConnections.accessTokenEnc,
      },
    })
    .from(shipmentResellerInvoices)
    .innerJoin(orderShipments, eq(orderShipments.id, shipmentResellerInvoices.shipmentId))
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .innerJoin(storeConnections, eq(storeConnections.id, orders.storeConnectionId))
    .innerJoin(suppliers, eq(suppliers.id, orderShipments.supplierId))
    .leftJoin(tenantProfile, eq(tenantProfile.tenantId, shipmentResellerInvoices.tenantId))
    .where(eq(shipmentResellerInvoices.id, invoiceId));
  if (row === undefined) {
    return null;
  }
  const [lines, connection] = await Promise.all([
    parcelInvoiceLines(database, row.orderId, row.items),
    findResellerErpConnection(database, { tenantId: row.tenantId, provider: "bling" }),
  ]);
  return {
    invoiceId,
    tenantId: row.tenantId,
    externalOrderId: row.externalOrderId,
    orderedAt: row.orderedAt,
    address: row.address,
    lines,
    supplierFiscal: readSupplierFiscalProfile(row.supplierFiscal),
    resellerAddress: row.resellerAddress ?? null,
    settings: connection?.saleNoteSettings ?? null,
    store: row.store,
  };
}
