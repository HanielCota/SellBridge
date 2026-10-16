import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

/** Raw `execute` rows bring counts and sums back as text (bigint, numeric), so they are coerced. */
export const sqlIntegerSchema = z.coerce.number().int();

/** Dates inside raw SQL fragments reach the driver as text, so they are cast explicitly. */
export function timestampOf(date: Date): SQL {
  return sql`${date.toISOString()}::timestamptz`;
}
