import { findErpConnection, setOnBehalfOperations } from "@sellbridge/database/repositories";
import type { BlingOperation } from "@sellbridge/marketplaces/bling";
import { conflictError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import {
  blingCredentials,
  supplierBlingClient,
} from "@/features/supplier-panel/bling/bling-access.server";
import { onBehalfOperationsRefusal, type ErpActor } from "./bling-connection";

const BLING = { provider: "bling" } as const;

/** The venda à ordem operations: what the supplier's Bling offers and what is chosen. */
export interface OnBehalfOperationsView {
  /** False while the Bling app or the supplier's account is not connected: nothing to list. */
  readonly connected: boolean;
  readonly operations: readonly BlingOperation[];
  readonly shipmentOperationId: number | null;
  readonly saleOperationId: number | null;
}

const NOT_CONNECTED: OnBehalfOperationsView = {
  connected: false,
  operations: [],
  shipmentOperationId: null,
  saleOperationId: null,
};

/** Reads the active operations of the supplier's Bling, next to the two chosen ones. */
export async function loadOnBehalfOperations(supplierId: string): Promise<OnBehalfOperationsView> {
  const credentials = blingCredentials();
  if (credentials === null) {
    return NOT_CONNECTED;
  }
  const connection = await findErpConnection(database, { supplierId, ...BLING });
  if (connection?.status !== "connected") {
    return NOT_CONNECTED;
  }
  const operations = await supplierBlingClient(supplierId, credentials).listOperations();
  return {
    connected: true,
    operations,
    shipmentOperationId: connection.onBehalfShipmentOperationId,
    saleOperationId: connection.onBehalfSaleOperationId,
  };
}

/**
 * Saves the two operations, after checking both are active ones of the supplier's Bling.
 *
 * @throws {AppError} CONFLICT when the team is visiting, Bling is not connected, both are the same,
 * or the account has no such operation.
 */
export async function saveOnBehalfOperations(input: {
  supplierId: string;
  shipmentOperationId: number;
  saleOperationId: number;
  actor: ErpActor;
}): Promise<OnBehalfOperationsView> {
  const current = await loadOnBehalfOperations(input.supplierId);
  const refusal = onBehalfOperationsRefusal({
    ...input,
    connected: current.connected,
    knownOperationIds: new Set(current.operations.map((operation) => operation.id)),
  });
  if (refusal !== null) {
    throw conflictError(refusal);
  }
  await setOnBehalfOperations(database, input);
  logger.info("bling.on_behalf_operations_saved", { supplierId: input.supplierId });
  return {
    ...current,
    shipmentOperationId: input.shipmentOperationId,
    saleOperationId: input.saleOperationId,
  };
}
