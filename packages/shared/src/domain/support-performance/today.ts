import { brazilDay } from "./calendar.ts";
import { firstResponseMinutes } from "./series.ts";
import { ratingRate } from "./team.ts";
import type {
  OpenedTicketRow,
  RatingRow,
  ResolutionRow,
  SupportToday,
  TeamReplyRow,
  TodayEvent,
} from "./types.ts";

/*
 * The day panel of a single-day period: the day's numbers and a short timeline of what happened
 * to tickets, newest first. "Right now" figures (queue, late) come from the report's queue.
 */

const EVENTS_SHOWN = 8;

function subject(row: OpenedTicketRow | ResolutionRow | RatingRow) {
  return {
    ticketId: row.ticketId,
    origin: row.origin,
    category: row.category,
    situationId: row.situationId,
  };
}

function events(input: {
  opened: readonly OpenedTicketRow[];
  resolutions: readonly ResolutionRow[];
  ratings: readonly RatingRow[];
}): TodayEvent[] {
  const all: TodayEvent[] = [
    ...input.opened.map((row) => ({
      ...subject(row),
      at: row.createdAt.toISOString(),
      kind: "opened" as const,
      agentId: null,
      rating: null,
    })),
    ...input.resolutions.map((row) => ({
      ...subject(row),
      at: row.closedAt.toISOString(),
      kind: "resolved" as const,
      agentId: row.resolverId,
      rating: null,
    })),
    ...input.ratings.map((row) => ({
      ...subject(row),
      at: row.ratedAt.toISOString(),
      kind: "rated" as const,
      agentId: row.resolverId,
      rating: row.rating,
    })),
  ];
  return all.toSorted((first, second) => second.at.localeCompare(first.at)).slice(0, EVENTS_SHOWN);
}

export function buildToday(input: {
  opened: readonly OpenedTicketRow[];
  resolutions: readonly ResolutionRow[];
  ratings: readonly RatingRow[];
  replies: readonly TeamReplyRow[];
  fromDate: string;
  now: Date;
}): SupportToday {
  return {
    isToday: input.fromDate === brazilDay(input.now),
    opened: input.opened.length,
    replies: input.replies.length,
    resolved: input.resolutions.length,
    firstResponseMinutes: firstResponseMinutes(input.opened),
    rating: ratingRate(input.ratings),
    cameBack: input.resolutions.filter((row) => row.cameBack).length,
    events: events(input),
  };
}
