import { sql, type SQL } from "drizzle-orm";
import type { TicketReader } from "./support.ts";

/**
 * True when the other side wrote after the reader's last visit to the thread. Written with
 * aliases on purpose: in a single-table select Drizzle leaves columns unqualified, and inside
 * the subquery `"id"` would then mean the message, not the ticket.
 */
export function hasUnreadSql(reader: TicketReader | undefined): SQL<boolean> {
  if (!reader) {
    return sql<boolean>`false`;
  }
  const fromOtherSide =
    reader.side === "customer"
      ? sql.raw(`unread_m.is_admin and not unread_m.is_internal`)
      : sql.raw(`not unread_m.is_admin`);
  return sql<boolean>`exists (
    select 1 from ticket_messages unread_m
    where unread_m.ticket_id = "tickets"."id"
      and ${fromOtherSide}
      and unread_m.created_at > coalesce((
        select unread_r.read_at from ticket_reads unread_r
        where unread_r.ticket_id = "tickets"."id" and unread_r.user_id = ${reader.userId}
      ), '-infinity'::timestamptz)
  )`;
}
