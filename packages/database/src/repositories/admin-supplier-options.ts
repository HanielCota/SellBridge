import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { suppliers } from "../schema/index.ts";
import { publicSupplier } from "./sql/sellable.ts";

export interface AdminSupplierOption {
  id: string;
  name: string;
}

/**
 * Every active supplier, catalog or not, for staff filters and pickers. Resellers only find the
 * ones with an approved product (`listActiveSuppliers`); staff still needs the empty ones.
 */
export async function listAdminSupplierOptions(database: Database): Promise<AdminSupplierOption[]> {
  return database
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.active, true), publicSupplier()))
    .orderBy(asc(suppliers.name));
}
