import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { suppliers } from "../schema/index.ts";

/** What the supplier reads when the team switched the account off: the switch cannot help. */
export const SUPPLIER_OFF_STORE_MESSAGE =
  "Sua conta está desligada pela equipe SellBridge, então a loja não pode ser reaberta por aqui.";

/**
 * Opens or closes the supplier's store for sales. Closed, every listing of its products syncs
 * zero stock (`sellableOnMarketplace`), so no new order comes in; open again, the sync sends the
 * real stock back. Orders already received are untouched. Closing an already closed store keeps
 * the first closing time.
 *
 * @returns When the store closed, or null when it is open.
 * @throws {AppError} NOT_FOUND when the supplier does not exist; CONFLICT when the team switched
 * it off, which only the team can undo.
 */
export async function setSupplierStoreOpen(
  database: Database,
  input: { supplierId: string; open: boolean; now: Date },
): Promise<{ salesClosedAt: Date | null }> {
  return await database.transaction(async (transaction) => {
    const [supplier] = await transaction
      .select({ active: suppliers.active, salesClosedAt: suppliers.salesClosedAt })
      .from(suppliers)
      .where(eq(suppliers.id, input.supplierId))
      .for("update");
    if (supplier === undefined) {
      throw notFoundError("Fornecedor não encontrado");
    }
    if (!supplier.active) {
      throw conflictError(SUPPLIER_OFF_STORE_MESSAGE);
    }
    const salesClosedAt = input.open ? null : (supplier.salesClosedAt ?? input.now);
    await transaction
      .update(suppliers)
      .set({ salesClosedAt })
      .where(eq(suppliers.id, input.supplierId));
    return { salesClosedAt };
  });
}
