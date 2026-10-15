import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import {
  storeSupplierRefusal,
  storeSupplierRefusalMessage,
} from "@sellbridge/shared/store-supplier";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { storeConnections, suppliers } from "../schema/index.ts";

export interface AssignStoreSupplierInput {
  tenantId: string;
  storeConnectionId: string;
  supplierId: string;
}

/** Refuses a supplier that does not exist or is inactive. */
export async function assertActiveSupplier(
  executor: DatabaseExecutor,
  supplierId: string,
): Promise<void> {
  const [supplier] = await executor
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.active, true)))
    .limit(1);
  if (supplier === undefined) {
    throw notFoundError("Fornecedor não encontrado ou inativo");
  }
}

/**
 * Links a shop of the tenant to the one supplier it sells. Moving the shop's existing listings
 * off the previous supplier is the caller's job (it shows the impact first).
 */
export async function assignStoreSupplier(
  database: Database,
  input: AssignStoreSupplierInput,
): Promise<void> {
  await assertActiveSupplier(database, input.supplierId);
  const updated = await database
    .update(storeConnections)
    .set({ supplierId: input.supplierId })
    .where(
      and(
        eq(storeConnections.id, input.storeConnectionId),
        eq(storeConnections.tenantId, input.tenantId),
        ne(storeConnections.status, "disconnected"),
      ),
    )
    .returning({ id: storeConnections.id });
  if (updated.length === 0) {
    throw notFoundError("Loja não encontrada");
  }
}

/**
 * Refuses publishing a product of `supplierId` in any of the given shops unless each one sells
 * exactly that supplier. Shops of other tenants are ignored here: the caller already narrowed
 * the list to the tenant's connected shops.
 */
export async function assertStoresSellSupplier(
  executor: DatabaseExecutor,
  tenantId: string,
  storeConnectionIds: readonly string[],
  supplierId: string,
): Promise<void> {
  if (storeConnectionIds.length === 0) {
    return;
  }
  const stores = await executor
    .select({ supplierId: storeConnections.supplierId })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(storeConnections.id, [...storeConnectionIds]),
      ),
    );
  for (const store of stores) {
    const refusal = storeSupplierRefusal(store.supplierId, supplierId);
    if (refusal !== null) {
      throw conflictError(storeSupplierRefusalMessage(refusal));
    }
  }
}
