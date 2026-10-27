import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { tickets } from "../schema/index.ts";
import { assignTicket } from "./support.ts";
import { platformTicketSql } from "./support-audience.ts";
import { isOverdue } from "./support-deadline.ts";

/*
 * From a person's sheet on the performance screen: their late tickets go to someone with room,
 * one by one through `assignTicket`, so every move is checked, locked and recorded as usual.
 */

/** The late platform tickets held by `assigneeId`, the longest wait first. */
export async function listOverdueTicketIds(
  database: Database,
  input: { assigneeId: string; now: Date },
): Promise<string[]> {
  const rows = await database
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(platformTicketSql, eq(tickets.assigneeId, input.assigneeId), isOverdue(input.now)))
    .orderBy(asc(tickets.awaitingSince));
  return rows.map((row) => row.id);
}

/** Hands every late ticket of `fromId` to `toId`; returns how many moved. */
export async function reassignOverdueTickets(
  database: Database,
  input: { fromId: string; toId: string; actorId: string; now?: Date },
): Promise<number> {
  const now = input.now ?? new Date();
  const ids = await listOverdueTicketIds(database, { assigneeId: input.fromId, now });
  for (const ticketId of ids) {
    await assignTicket(database, {
      ticketId,
      assigneeId: input.toId,
      actorId: input.actorId,
      mayAssignOthers: true,
      now,
    });
  }
  return ids.length;
}
