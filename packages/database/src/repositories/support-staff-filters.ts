import type { TicketCategory, TicketPriority, TicketStatus } from "@sellbridge/shared/ticket-rules";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { NO_SITUATION_FILTER } from "@sellbridge/shared/schemas";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { organization, tickets } from "../schema/index.ts";
import { withoutActiveAssigneeSql } from "./support-assignee.ts";
import { platformTicketSql, supplierConversationSql } from "./support-audience.ts";
import { isOverdue } from "./support-deadline.ts";
import { staffTicketSearch } from "./support-search.ts";
import { containsPattern } from "./sql/search-pattern.ts";

export interface StaffTicketFilters {
  /** `suppliers`: the reseller ↔ supplier conversations the team reads; the rest is its own. */
  queue: "unassigned" | "mine" | "overdue" | "all" | "suppliers";
  status?: TicketStatus | undefined;
  priority?: TicketPriority | undefined;
  category?: TicketCategory | undefined;
  /** The support-topic situation (from the performance screen's subjects). */
  situationId?: string | undefined;
  /** Tickets held by one team member (from the performance screen's people). */
  assigneeId?: string | undefined;
  /** Only resellers' (`seller`) or only suppliers' (`supplier`) tickets. */
  customerKind?: ProfileKind | undefined;
  search?: string | undefined;
}

function queueCondition(queue: StaffTicketFilters["queue"], viewerId: string, now: Date) {
  if (queue === "suppliers") {
    return supplierConversationSql;
  }
  if (queue === "unassigned") {
    return and(
      platformTicketSql,
      withoutActiveAssigneeSql,
      inArray(tickets.status, ["open", "answered"]),
    );
  }
  if (queue === "mine") {
    return and(
      platformTicketSql,
      eq(tickets.assigneeId, viewerId),
      inArray(tickets.status, ["open", "answered"]),
    );
  }
  if (queue === "overdue") {
    return and(platformTicketSql, isOverdue(now));
  }
  return platformTicketSql;
}

/** `sem-detalhe` (NO_SITUATION_FILTER) asks for tickets with no recorded situation. */
function situationCondition(situationId: string | undefined) {
  if (situationId === undefined) {
    return undefined;
  }
  return situationId === NO_SITUATION_FILTER
    ? isNull(tickets.situationId)
    : eq(tickets.situationId, situationId);
}

/** The inbox's `where`: the queue plus every filter the team picked. */
export function staffTicketConditions(
  input: StaffTicketFilters & { viewerId: string },
  now: Date,
): SQL | undefined {
  const term = input.search ? containsPattern(input.search) : undefined;
  return and(
    queueCondition(input.queue, input.viewerId, now),
    input.status ? eq(tickets.status, input.status) : undefined,
    input.priority ? eq(tickets.priority, input.priority) : undefined,
    input.category ? eq(tickets.category, input.category) : undefined,
    situationCondition(input.situationId),
    input.customerKind ? eq(organization.kind, input.customerKind) : undefined,
    input.assigneeId ? eq(tickets.assigneeId, input.assigneeId) : undefined,
    term ? staffTicketSearch(term) : undefined,
  );
}
