import { validationError } from "@sellbridge/shared/errors";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { ticketEvents, tickets } from "../schema/index.ts";
import { isActiveStaff } from "./support-assignee.ts";
import { platformTicketSql } from "./support-audience.ts";
import { isOverdue } from "./support-deadline.ts";

/*
 * From a person's sheet on the performance screen: their late tickets go to someone with room.
 * The tickets are picked and locked in the same statement, inside one transaction, so a ticket
 * another supervisor moved (or the person answered) while this ran keeps its new state.
 */

function overdueOfSql(assigneeId: string, now: Date) {
  return and(platformTicketSql, eq(tickets.assigneeId, assigneeId), isOverdue(now));
}

/** Hands every late ticket of `fromId` to `toId`; returns how many moved. */
export async function reassignOverdueTickets(
  database: Database,
  input: { fromId: string; toId: string; actorId: string; now?: Date },
): Promise<number> {
  const now = input.now ?? new Date();
  if (input.fromId === input.toId) {
    return 0;
  }
  return database.transaction(async (transaction) => {
    if (!(await isActiveStaff(transaction, input.toId))) {
      throw validationError("Escolha alguém da equipe de suporte");
    }
    // FOR UPDATE re-checks the filter on a row another transaction held once it frees; the id
    // order keeps two concurrent moves from locking the same rows in opposite orders.
    const locked = await transaction
      .select({ id: tickets.id })
      .from(tickets)
      .where(overdueOfSql(input.fromId, now))
      .orderBy(asc(tickets.id))
      .for("update");
    const ids = locked.map((row) => row.id);
    if (ids.length === 0) {
      return 0;
    }
    await transaction
      .update(tickets)
      .set({ assigneeId: input.toId, updatedAt: now })
      .where(inArray(tickets.id, ids));
    await transaction.insert(ticketEvents).values(
      ids.map((ticketId) => ({
        ticketId,
        actorId: input.actorId,
        type: "assigned" as const,
        fromValue: input.fromId,
        toValue: input.toId,
        createdAt: now,
      })),
    );
    return ids.length;
  });
}
