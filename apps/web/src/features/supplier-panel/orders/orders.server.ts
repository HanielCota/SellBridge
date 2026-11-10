import {
  countSupplierShipmentsByTab,
  getSupplierPanelShipment,
  listSupplierResellerStores,
  listSupplierShipments,
  supplierOwnedShipments,
} from "@sellbridge/database/repositories";
import { resolvePeriod } from "@sellbridge/shared/period-range";
import type { SupplierPaymentBadge } from "@sellbridge/shared/shipment-payments";
import { logger } from "@sellbridge/shared/logger";
import type { shipmentUpdateSchema } from "@sellbridge/shared/schemas";
import type {
  BatchAcceptInput,
  SupplierShipmentCountsSearch,
  SupplierShipmentsSearch,
} from "@sellbridge/shared/supplier-panel-orders-schema";
import type { z } from "zod";
import { database } from "@/lib/server/database";
import { supplierPaymentBadges } from "@/features/supplier-payments/supplier-payments.server";
import { writeShipmentUpdate } from "@/features/fulfillment/shipments.server";
import { acceptEachShipment, acceptRefusal, type BatchAcceptReport } from "./batch-accept";
import { conflictError } from "@sellbridge/shared/errors";

/*
 * The supplier panel's Pedidos: every read and write is scoped to the `supplierId` passed in,
 * which the access layer resolves from the supplier's session. Writes go through the same
 * `updateShipment` as the supplier link, credited to the supplier.
 */

/** The list filters with the period as dates: "Tudo" has none, the rest are Brazil days. */
function withSaleDates<TSearch extends SupplierShipmentCountsSearch>(search: TSearch) {
  const { period, from, to, ...filters } = search;
  const range = period === "all" ? null : resolvePeriod({ period, from, to }, new Date());
  return { ...filters, orderedFrom: range?.from, orderedTo: range?.to };
}

/** The page of parcels, each with whether the reseller already paid the supplier for it. */
export async function loadSupplierShipments(search: SupplierShipmentsSearch) {
  const page = await listSupplierShipments(database, withSaleDates(search));
  const badges = await supplierPaymentBadges({
    supplierId: search.supplierId,
    shipmentIds: page.items.map((item) => item.id),
  });
  return {
    ...page,
    items: page.items.map((item) => ({
      ...item,
      supplierPayment: badges.get(item.id) ?? OUTSIDE_PAYMENT,
    })),
  };
}

const OUTSIDE_PAYMENT: SupplierPaymentBadge = { kind: "outside" };

export async function loadSupplierShipmentCounts(input: SupplierShipmentCountsSearch) {
  return await countSupplierShipmentsByTab(database, withSaleDates(input));
}

export async function loadSupplierResellerStores(supplierId: string) {
  return await listSupplierResellerStores(database, supplierId);
}

export async function loadSupplierShipment(input: { supplierId: string; shipmentId: string }) {
  const [shipment, badges] = await Promise.all([
    getSupplierPanelShipment(database, input),
    supplierPaymentBadges({ supplierId: input.supplierId, shipmentIds: [input.shipmentId] }),
  ]);
  return { ...shipment, supplierPayment: badges.get(input.shipmentId) ?? OUTSIDE_PAYMENT };
}

type ShipmentUpdate = z.infer<typeof shipmentUpdateSchema>;

/** A step or an occurrence from the shipment panel, as the supplier. */
export async function writeSupplierShipmentUpdate(input: {
  supplierId: string;
  update: ShipmentUpdate;
}) {
  return await writeShipmentUpdate(input.update, { supplierId: input.supplierId });
}

/** Accepts the selected parcels and says, for each one, whether it went through and why not. */
export async function acceptSupplierShipments(input: BatchAcceptInput): Promise<BatchAcceptReport> {
  const owned = await supplierOwnedShipments(database, input.supplierId, input.shipmentIds);
  const report = await acceptEachShipment(
    input.shipmentIds,
    async (shipmentId) => {
      const refusal = acceptRefusal(shipmentId, owned);
      if (refusal !== null) {
        throw conflictError(refusal);
      }
      return await writeShipmentUpdate(
        {
          shipmentId,
          status: "accepted",
          carrier: "",
          trackingCode: "",
          trackingUrl: "",
          note: "",
        },
        { supplierId: input.supplierId },
      );
    },
    (shipmentId, error) =>
      logger.error("supplier_panel.batch_accept_failed", {
        supplierId: input.supplierId,
        shipmentId,
        error,
      }),
  );
  logger.info("supplier_panel.batch_accepted", {
    supplierId: input.supplierId,
    accepted: report.acceptedCount,
    failed: report.failedCount,
  });
  return report;
}
