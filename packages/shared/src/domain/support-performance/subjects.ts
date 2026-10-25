import {
  CAME_BACK_WINDOW_DAYS,
  MINIMUM_RESOLVED_TO_COMPARE,
  median,
  minutesBetween,
  noReopenOf,
} from "./rules.ts";
import type {
  OpenedTicketRow,
  RatingRow,
  ResolutionRow,
  SubjectKey,
  SubjectPerformance,
} from "./types.ts";

/** One string per subject (profile kind + topic + situation), for maps and React keys. */
export function subjectKeyOf(subject: SubjectKey): string {
  return `${subject.origin}|${subject.category}|${subject.situationId ?? ""}`;
}

function subjectOf(row: SubjectKey): SubjectKey {
  return { origin: row.origin, category: row.category, situationId: row.situationId };
}

function groupBy<Row>(rows: readonly Row[], keyOf: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

/**
 * Who solved a subject best: the most resolutions that did not come back, among people with
 * enough of them to count. Ties go to the higher rate.
 */
function bestAgentOf(resolutions: readonly ResolutionRow[], now: Date): string | null {
  const settledBy = now.getTime() - CAME_BACK_WINDOW_DAYS * 86_400_000;
  const byAgent = groupBy(
    resolutions.filter((row) => row.resolverId !== null && row.closedAt.getTime() <= settledBy),
    (row) => row.resolverId ?? "",
  );
  const candidates = [...byAgent.entries()]
    .filter(([, rows]) => rows.length >= MINIMUM_RESOLVED_TO_COMPARE)
    .map(([agentId, rows]) => {
      const kept = rows.filter((row) => !row.cameBack).length;
      return { agentId, kept, rate: kept / rows.length };
    })
    .toSorted((first, second) => second.kept - first.kept || second.rate - first.rate);
  return candidates.at(0)?.agentId ?? null;
}

export interface SubjectRows {
  opened: readonly OpenedTicketRow[];
  previousOpened: readonly OpenedTicketRow[];
  resolutions: readonly ResolutionRow[];
  ratings: readonly RatingRow[];
  now: Date;
}

/** Every subject that had tickets or resolutions in the period, the most frequent first. */
export function buildSubjects(rows: SubjectRows): SubjectPerformance[] {
  const opened = groupBy(rows.opened, subjectKeyOf);
  const previous = groupBy(rows.previousOpened, subjectKeyOf);
  const resolved = groupBy(rows.resolutions, subjectKeyOf);
  const rated = groupBy(rows.ratings, subjectKeyOf);
  const subjects = new Map<string, SubjectKey>();
  for (const row of [...rows.opened, ...rows.resolutions]) {
    subjects.set(subjectKeyOf(row), subjectOf(row));
  }
  return [...subjects.entries()]
    .map(([key, subject]) => {
      const closes = resolved.get(key) ?? [];
      const ratings = rated.get(key) ?? [];
      return {
        ...subject,
        opened: { current: opened.get(key)?.length ?? 0, previous: previous.get(key)?.length ?? 0 },
        resolved: closes.length,
        resolveMinutes: median(closes.map((row) => minutesBetween(row.openedAt, row.closedAt))),
        noReopen: noReopenOf(closes, rows.now),
        rating: {
          value:
            ratings.length === 0
              ? null
              : ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length,
          sample: ratings.length,
        },
        bestAgentId: bestAgentOf(closes, rows.now),
      };
    })
    .toSorted(
      (first, second) =>
        second.opened.current - first.opened.current || second.resolved - first.resolved,
    );
}
