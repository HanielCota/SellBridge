import {
  countSupplierShipmentsByTab,
  getSupplierPanelShipment,
  listSupplierShipments,
  supplierOwnedShipments,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import type { shipmentUpdateSchema } from "@sellbridge/shared/schemas";
import type {
  BatchAcceptInput,
  SupplierShipmentsSearch,
} from "@sellbridge/shared/supplier-panel-orders-schema";
import type { z } from "zod";
import { database } from "@/lib/server/database";
import { writeShipmentUpdate } from "@/features/fulfillment/shipments.server";
import { acceptEachShipment, acceptRefusal, type BatchAcceptReport } from "./batch-accept";
import { conflictError } from "@sellbridge/shared/errors";

/*
 * The supplier panel's Pedidos: every read and write is scoped to the `supplierId` passed in,
 * which the access layer resolves from the supplier's session. Writes go through the same
 * `updateShipment` as the supplier link, credited to the supplier.
 */

export async function loadSupplierShipments(search: SupplierShipmentsSearch) {
  return await listSupplierShipments(database, search);
}

export async function loadSupplierShipmentCounts(input: { supplierId: string; query: string }) {
  return await countSupplierShipmentsByTab(database, input);
}

export async function loadSupplierShipment(input: { supplierId: string; shipmentId: string }) {
  return await getSupplierPanelShipment(database, input);
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
