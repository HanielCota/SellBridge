import { findSupplierShipmentsByCode } from "@sellbridge/database/repositories";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import type { SupplierScanInput } from "@sellbridge/shared/supplier-panel-orders-schema";
import { writeShipmentUpdate } from "@/features/fulfillment/shipments.server";
import { database } from "@/lib/server/database";
import { scanPlan } from "./scan";

export interface ScanResult {
  externalOrderId: string;
  status: FulfillmentStatus;
  /** Whether the scan moved the parcel, or found it already where this check brings it. */
  moved: boolean;
}

/**
 * One barcode read in the check: finds the supplier's open parcel by order number or tracking
 * code and moves it forward, step by step, through the same write as the panel's buttons.
 */
export async function scanSupplierShipment(input: SupplierScanInput): Promise<ScanResult> {
  const matches = await findSupplierShipmentsByCode(database, input.supplierId, input.code);
  const [shipment, another] = matches;
  if (shipment === undefined) {
    throw notFoundError("Nenhum pedido seu em aberto com este código.");
  }
  if (another !== undefined) {
    throw conflictError("Mais de um pedido com este código: abra pela lista de pedidos.");
  }
  const plan = scanPlan(shipment, input.mode);
  if (plan.kind === "refused") {
    throw conflictError(plan.reason);
  }
  // One step after the other: each write checks the step before it.
  for (const status of plan.steps) {
    const ships = status === "shipped";
    await writeShipmentUpdate(
      {
        shipmentId: shipment.id,
        status,
        carrier: ships ? (shipment.carrier ?? "") : "",
        trackingCode: ships ? (shipment.trackingCode ?? "") : "",
        trackingUrl: "",
        note: "",
      },
      { supplierId: input.supplierId },
    );
  }
  logger.info("supplier_panel.scanned", {
    supplierId: input.supplierId,
    shipmentId: shipment.id,
    mode: input.mode,
    steps: plan.steps.length,
  });
  return {
    externalOrderId: shipment.externalOrderId,
    status: plan.steps.at(-1) ?? shipment.status,
    moved: plan.steps.length > 0,
  };
}
