import type { AgentStanding, Rate } from "./types.ts";

/*
 * The thresholds behind the support performance screen. Named and tested here so the
 * coordination can read, and later tune, exactly what makes someone "need support".
 */

/** A resolution that comes back within this many days did not really solve the problem. */
export const CAME_BACK_WINDOW_DAYS = 7;

/** Below this many resolutions in the period a person is not compared (no colour, no standing). */
export const MINIMUM_RESOLVED_TO_COMPARE = 5;

/** New team members are "em experiência" for this many days after joining. */
export const PROBATION_DAYS = 90;

/** "Precisa de apoio" below this first-response-on-time rate. */
export const ON_TIME_NEEDS_SUPPORT_BELOW = 0.8;

/** "Precisa de apoio" when "sem reabrir" falls this far below what the subject mix predicts. */
export const NO_REOPEN_NEEDS_SUPPORT_GAP = 0.05;

/** "Acima da equipe" needs at least this on-time rate… */
export const ON_TIME_ABOVE_TEAM_FROM = 0.92;

/** …and "sem reabrir" at least this far above what the subject mix predicts. */
export const NO_REOPEN_ABOVE_TEAM_GAP = 0.03;

/** A subject is "rising" with at least this many more tickets… */
export const RISING_SUBJECT_MIN_INCREASE = 3;

/** …and at least this growth over the previous period. */
export const RISING_SUBJECT_MIN_GROWTH = 0.5;

/** "Outro problema" above this share of a topic means the form misses a situation. */
export const OPEN_ENDED_ATTENTION_SHARE = 0.2;

/** …measured on at least this many tickets of the topic. */
export const OPEN_ENDED_MIN_TICKETS = 5;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.toSorted((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const low = sorted[middle - 1];
  const high = sorted[middle];
  if (low === undefined || high === undefined) {
    return null;
  }
  return (low + high) / 2;
}

export function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Share of `items` that pass, with the sample size kept beside it. */
export function rateOf<Item>(items: readonly Item[], passes: (item: Item) => boolean): Rate {
  if (items.length === 0) {
    return { value: null, sample: 0 };
  }
  return { value: items.filter(passes).length / items.length, sample: items.length };
}

export function minutesBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 60_000;
}

/**
 * "Sem reabrir" only counts closes that have had the whole window to come back: a close from
 * yesterday that will be reopened in three days would otherwise count as solved today.
 */
export function noReopenOf(
  resolutions: readonly { closedAt: Date; cameBack: boolean }[],
  now: Date,
): Rate {
  const settledBy = now.getTime() - CAME_BACK_WINDOW_DAYS * 86_400_000;
  return rateOf(
    resolutions.filter((row) => row.closedAt.getTime() <= settledBy),
    (row) => !row.cameBack,
  );
}

/**
 * The fair yardstick: what the team's "sem reabrir" would be on this person's mix of subjects.
 * `ownCounts` maps a subject key to how many the person resolved; `teamRates` to the team's
 * rate on that subject.
 */
export function expectedRate(
  ownCounts: ReadonlyMap<string, number>,
  teamRates: ReadonlyMap<string, number>,
): number | null {
  let weighted = 0;
  let total = 0;
  for (const [key, count] of ownCounts) {
    const teamRate = teamRates.get(key);
    if (teamRate === undefined) {
      continue;
    }
    weighted += teamRate * count;
    total += count;
  }
  return total === 0 ? null : weighted / total;
}

export interface StandingInput {
  overdueNow: number;
  resolved: number;
  onTime: Rate;
  noReopen: Rate;
  expectedNoReopen: number | null;
}

/** A rate measured on too few items says nothing: one late reply is not "0% no prazo". */
function comparable(rate: Rate): number | null {
  return rate.sample < MINIMUM_RESOLVED_TO_COMPARE ? null : rate.value;
}

function needsSupport(input: StandingInput): boolean {
  const onTime = comparable(input.onTime);
  if (onTime !== null && onTime < ON_TIME_NEEDS_SUPPORT_BELOW) {
    return true;
  }
  const noReopen = comparable(input.noReopen);
  if (noReopen === null || input.expectedNoReopen === null) {
    return false;
  }
  return noReopen < input.expectedNoReopen - NO_REOPEN_NEEDS_SUPPORT_GAP;
}

function aboveTeam(input: StandingInput): boolean {
  const onTime = comparable(input.onTime);
  const noReopen = comparable(input.noReopen);
  if (onTime === null || noReopen === null || input.expectedNoReopen === null) {
    return false;
  }
  return (
    onTime >= ON_TIME_ABOVE_TEAM_FROM &&
    noReopen >= input.expectedNoReopen + NO_REOPEN_ABOVE_TEAM_GAP
  );
}

/** One word for a person, in priority order: late tickets first, then the comparisons. */
export function agentStanding(input: StandingInput): AgentStanding {
  if (input.overdueNow > 0) {
    return "overdue";
  }
  if (input.resolved < MINIMUM_RESOLVED_TO_COMPARE) {
    return "too_few";
  }
  if (needsSupport(input)) {
    return "needs_support";
  }
  if (aboveTeam(input)) {
    return "above_team";
  }
  return "on_par";
}

/** The order the team list reads in: who needs the coordinator first. */
export const STANDING_ORDER: Readonly<Record<AgentStanding, number>> = {
  overdue: 0,
  needs_support: 1,
  on_par: 2,
  above_team: 3,
  too_few: 4,
};
