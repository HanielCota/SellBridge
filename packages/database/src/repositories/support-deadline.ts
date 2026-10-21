import { RESPONSE_TARGET_HOURS, TICKET_PRIORITIES } from "@sellbridge/shared/ticket-rules";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { tickets } from "../schema/index.ts";
import { timestampOf } from "./sql/raw-values.ts";

/**
 * `base` plus the ticket priority's target hours, in SQL. The hours are inlined: bound as
 * parameters inside the CASE they would reach Postgres as text.
 */
export function plusResponseTarget(base: SQLWrapper): SQL {
  return sql`(${base} + (case ${tickets.priority} ${sql.join(
    TICKET_PRIORITIES.map((priority) =>
      sql.raw(`when '${priority}' then ${RESPONSE_TARGET_HOURS[priority]}`),
    ),
    sql` `,
  )} end) * interval '1 hour')`;
}

export const responseDueAtSql = plusResponseTarget(tickets.awaitingSince);

export function isOverdue(now: Date): SQL {
  return sql`(${tickets.status} = 'open' and ${tickets.awaitingSince} is not null and ${responseDueAtSql} < ${timestampOf(now)})`;
}
