import { ilike, or, sql, type SQL } from "drizzle-orm";
import { organization, tickets, user } from "../schema/index.ts";

/**
 * What the team's search box matches: the subject, the store, the requester's e-mail and every
 * message of the ticket. The subject only keeps the start of the customer's text, so an order
 * number written further down was not found.
 */
export function staffTicketSearch(term: string): SQL | undefined {
  return or(
    ilike(tickets.subject, term),
    ilike(organization.name, term),
    ilike(user.email, term),
    sql`exists (
      select 1 from "ticket_messages" search_m
      where search_m.ticket_id = "tickets"."id" and search_m.body ilike ${term}
    )`,
  );
}
