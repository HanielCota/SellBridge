import { brazilDay, brazilWeekdayHour, isSupportHour, supportHourColumns } from "./calendar.ts";
import { median, minutesBetween } from "./rules.ts";
import { subjectKeyOf } from "./subjects.ts";
import { answeredOnTime, lateFirstResponse } from "./team.ts";
import type { HeatCell, HeatTicket, OpenedTicketRow, SubjectKey, TeamReplyRow } from "./types.ts";

/*
 * The hours heatmap: for every weekday and support hour (plus "outside"), what came in, how long
 * customers waited, how many people were answering and the latest tickets of that slot.
 */

const RECENT_PER_CELL = 3;
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

type Column = number | "outside";

function columnOf(date: Date): { weekday: number; column: Column } {
  const { weekday, hour } = brazilWeekdayHour(date);
  return { weekday, column: isSupportHour(hour) ? hour : "outside" };
}

function cellKey(weekday: number, column: Column): string {
  return `${weekday}|${column}`;
}

function groupBy<Row>(rows: readonly Row[], keyOf: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

function statusOf(row: OpenedTicketRow, now: Date): HeatTicket["status"] {
  if (row.firstResponseAt === null) {
    return lateFirstResponse(row, now) ? "late" : "waiting";
  }
  return answeredOnTime(row) ? "answered_on_time" : "answered_late";
}

function topSubjectOf(rows: readonly OpenedTicketRow[]): SubjectKey | null {
  const groups = groupBy(rows, subjectKeyOf);
  const largest = [...groups.values()]
    .toSorted((first, second) => second.length - first.length)
    .at(0);
  const sample = largest?.[0];
  if (sample === undefined) {
    return null;
  }
  return { origin: sample.origin, category: sample.category, situationId: sample.situationId };
}

/** Distinct people answering in the slot, averaged over the weeks of the period. */
function respondersOf(replies: readonly TeamReplyRow[], weeks: number): number {
  const pairs = new Set(replies.map((reply) => `${reply.authorId}|${brazilDay(reply.createdAt)}`));
  return pairs.size / weeks;
}

function cellOf(input: {
  weekday: number;
  hour: Column;
  opened: readonly OpenedTicketRow[];
  replies: readonly TeamReplyRow[];
  weeks: number;
  now: Date;
}): HeatCell {
  const { opened } = input;
  return {
    weekday: input.weekday,
    hour: input.hour,
    opened: opened.length,
    firstResponseMinutes: median(
      opened.flatMap((row) =>
        row.firstResponseAt === null ? [] : [minutesBetween(row.createdAt, row.firstResponseAt)],
      ),
    ),
    responders: respondersOf(input.replies, input.weeks),
    topSubject: topSubjectOf(opened),
    recent: opened
      .toSorted((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
      .slice(0, RECENT_PER_CELL)
      .map((row) => ({
        ticketId: row.ticketId,
        origin: row.origin,
        category: row.category,
        situationId: row.situationId,
        createdAt: row.createdAt.toISOString(),
        agentId: row.firstResponderId,
        status: statusOf(row, input.now),
      })),
  };
}

export function buildHeatmap(input: {
  opened: readonly OpenedTicketRow[];
  replies: readonly TeamReplyRow[];
  /** Weeks in the period (at least one), for the per-week averages. */
  weeks: number;
  now: Date;
}): HeatCell[] {
  const columns: Column[] = [...supportHourColumns(), "outside"];
  const opened = groupBy(input.opened, (row) => {
    const { weekday, column } = columnOf(row.createdAt);
    return cellKey(weekday, column);
  });
  const replies = groupBy(input.replies, (row) => {
    const { weekday, column } = columnOf(row.createdAt);
    return cellKey(weekday, column);
  });
  return WEEKDAYS.flatMap((weekday) =>
    columns.map((hour) =>
      cellOf({
        weekday,
        hour,
        opened: opened.get(cellKey(weekday, hour)) ?? [],
        replies: replies.get(cellKey(weekday, hour)) ?? [],
        weeks: input.weeks,
        now: input.now,
      }),
    ),
  );
}
