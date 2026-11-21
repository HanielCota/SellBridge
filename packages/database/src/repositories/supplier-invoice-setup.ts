import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../client.ts";
import { supplierErpConnections, suppliers } from "../schema/index.ts";

/**
 * The supplier chose venda à ordem but no connected Bling issues its notes: its labels go out
 * without the remessa and nobody is told. The panel's "Precisa de você" warns about it.
 */
export async function isOnBehalfInvoiceOff(
  database: DatabaseExecutor,
  supplierId: string,
): Promise<boolean> {
  const issuing = database
    .select({ id: supplierErpConnections.id })
    .from(supplierErpConnections)
    .where(
      and(
        eq(supplierErpConnections.supplierId, suppliers.id),
        eq(supplierErpConnections.status, "connected"),
        isNotNull(supplierErpConnections.invoiceEnabledAt),
      ),
    );
  const [row] = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(
      and(
        eq(suppliers.id, supplierId),
        sql`${suppliers.fiscalProfile}->>'invoiceModel' = 'on_behalf'`,
        sql`not exists (${issuing})`,
      ),
    );
  return row !== undefined;
}
