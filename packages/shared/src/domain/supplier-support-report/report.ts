import { SUPPLIER_CONVERSATION_TOPIC_IDS } from "../supplier-conversation-topics.ts";
import { CAME_BACK_WINDOW_DAYS, median, minutesBetween } from "../support-performance/rules.ts";
import { DAY_MILLISECONDS } from "../time.ts";
import { answerDeadline } from "./answer-deadline.ts";
import type {
  ReportCloseRow,
  ReportConversationRow,
  ReportReopenRow,
  Share,
  SubjectRow,
  SupplierReportDays,
  SupplierSupportReport,
  SupplierSupportRows,
} from "./types.ts";

/*
 * The supplier's answering report: how it answers the stores that sell its products. The same
 * yardsticks as the team's support performance (median first response, "came back" within 7
 * days), with golden rule 4's deadline: one business day.
 */

// The project's TypeScript library predates `Map.groupBy`.
function groupBy<Row, Key>(rows: readonly Row[], keyOf: (row: Row) => Key): Map<Key, Row[]> {
  const groups = new Map<Key, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [row]);
      continue;
    }
    group.push(row);
  }
  return groups;
}

function isBetween(date: Date, since: Date, until: Date): boolean {
  return date >= since && date < until;
}

function waitingNow(conversations: readonly ReportConversationRow[], now: Date) {
  const waitingSince = conversations.flatMap((row) =>
    row.status === "open" && row.awaitingSince !== null ? [row.awaitingSince] : [],
  );
  const sorted = waitingSince.toSorted((first, second) => first.getTime() - second.getTime());
  return {
    count: sorted.length,
    late: sorted.filter((since) => answerDeadline(since) <= now).length,
    oldestSince: sorted.at(0) ?? null,
  };
}

type OnTimeOutcome = "on_time" | "late" | "not_due";

/**
 * Whether the first answer met the deadline. A conversation still inside it, or finished by the
 * store before it without needing an answer, is not counted either way.
 */
function onTimeOutcome(row: ReportConversationRow, now: Date): OnTimeOutcome {
  const deadline = answerDeadline(row.createdAt);
  if (row.firstResponseAt !== null) {
    return row.firstResponseAt < deadline ? "on_time" : "late";
  }
  if (row.status === "closed" && row.closedAt !== null && row.closedAt < deadline) {
    return "not_due";
  }
  return now >= deadline ? "late" : "not_due";
}

function answeredOnTime(conversations: readonly ReportConversationRow[], now: Date): Share {
  const outcomes = conversations.map((row) => onTimeOutcome(row, now));
  return {
    count: outcomes.filter((outcome) => outcome === "on_time").length,
    of: outcomes.filter((outcome) => outcome !== "not_due").length,
  };
}

function firstResponseMinutes(conversations: readonly ReportConversationRow[]): number | null {
  return median(
    conversations.flatMap((row) =>
      row.firstResponseAt === null ? [] : [minutesBetween(row.createdAt, row.firstResponseAt)],
    ),
  );
}

const CAME_BACK_WINDOW_MILLISECONDS = CAME_BACK_WINDOW_DAYS * DAY_MILLISECONDS;

function cameBackOf(
  closes: readonly ReportCloseRow[],
  reopensByTicket: ReadonlyMap<string, readonly ReportReopenRow[]>,
): Share {
  const cameBack = closes.filter((close) =>
    (reopensByTicket.get(close.ticketId) ?? []).some((reopen) => {
      const after = reopen.reopenedAt.getTime() - close.closedAt.getTime();
      return after > 0 && after <= CAME_BACK_WINDOW_MILLISECONDS;
    }),
  );
  return { count: cameBack.length, of: closes.length };
}

function subjectRows(
  received: readonly ReportConversationRow[],
  closes: readonly ReportCloseRow[],
  reopensByTicket: ReadonlyMap<string, readonly ReportReopenRow[]>,
): SubjectRow[] {
  const receivedByTopic = groupBy(received, (row) => row.topic);
  const closesByTopic = groupBy(closes, (row) => row.topic);
  const rows = SUPPLIER_CONVERSATION_TOPIC_IDS.flatMap((topic) => {
    const topicReceived = receivedByTopic.get(topic) ?? [];
    const topicCloses = closesByTopic.get(topic) ?? [];
    if (topicReceived.length === 0 && topicCloses.length === 0) {
      return [];
    }
    return [
      {
        topic,
        received: topicReceived.length,
        firstResponseMinutes: firstResponseMinutes(topicReceived),
        cameBack: cameBackOf(topicCloses, reopensByTicket),
      },
    ];
  });
  // A stable sort keeps the topics' own order between subjects with the same count.
  return rows.toSorted((first, second) => second.received - first.received);
}

/** The last `days` days ending at `now`, and the same length of time before them. */
export function supplierReportBounds(
  days: SupplierReportDays,
  now: Date,
): { since: Date; previousSince: Date } {
  const since = new Date(now.getTime() - days * DAY_MILLISECONDS);
  return { since, previousSince: new Date(since.getTime() - days * DAY_MILLISECONDS) };
}

/** The supplier's report for the last `days` days ending at `now`. */
export function buildSupplierSupportReport(
  rows: SupplierSupportRows,
  options: { days: SupplierReportDays; now: Date },
): SupplierSupportReport {
  const { days, now } = options;
  const { since, previousSince } = supplierReportBounds(days, now);
  const received = rows.conversations.filter((row) => isBetween(row.createdAt, since, now));
  const closes = rows.closes.filter((row) => isBetween(row.closedAt, since, now));
  const reopensByTicket = groupBy(rows.reopens, (row) => row.ticketId);
  return {
    days,
    waiting: waitingNow(rows.conversations, now),
    received: {
      current: received.length,
      previous: rows.conversations.filter((row) => isBetween(row.createdAt, previousSince, since))
        .length,
    },
    firstResponseMinutes: firstResponseMinutes(received),
    answeredOnTime: answeredOnTime(received, now),
    finished: {
      total: closes.length,
      supplier: closes.filter((row) => row.closedBy === "supplier").length,
      store: closes.filter((row) => row.closedBy === "store").length,
      automatic: closes.filter((row) => row.closedBy === "automatic").length,
    },
    cameBack: cameBackOf(closes, reopensByTicket),
    subjects: subjectRows(received, closes, reopensByTicket),
  };
}
