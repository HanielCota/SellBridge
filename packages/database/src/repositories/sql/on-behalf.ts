import { sql } from "drizzle-orm";
import {
  orderShipments,
  shipmentInvoices,
  shipmentResellerInvoices,
  suppliers,
  tenantProfile,
} from "../../schema/index.ts";

/**
 * The parcel is sold in venda à ordem: its supplier chose it and the reseller sells as a company
 * (a CPF reseller stays on the direct note, decision of 18/11/2026). Once the parcel has a note of
 * either model, that model stays, even if the supplier or the reseller changes later.
 */
export const soldOnBehalf = sql<boolean>`(
  exists (
    select 1 from ${shipmentResellerInvoices}
    where ${shipmentResellerInvoices.shipmentId} = ${orderShipments.id}
  )
  or (
    exists (
      select 1 from ${suppliers}
      where ${suppliers.id} = ${orderShipments.supplierId}
        and ${suppliers.fiscalProfile}->>'invoiceModel' = 'on_behalf'
    )
    and exists (
      select 1 from ${tenantProfile}
      where ${tenantProfile.tenantId} = ${orderShipments.tenantId}
        and ${tenantProfile.cnpj} is not null
    )
    and not exists (
      select 1 from ${shipmentInvoices}
      where ${shipmentInvoices.shipmentId} = ${orderShipments.id}
        and ${shipmentInvoices.kind} = 'direct'
    )
  )
)`;

/** The parcel already has a direct note: it stays on model A. */
export const hasDirectInvoice = sql<boolean>`exists (
  select 1 from ${shipmentInvoices}
  where ${shipmentInvoices.shipmentId} = ${orderShipments.id}
    and ${shipmentInvoices.kind} = 'direct'
)`;
