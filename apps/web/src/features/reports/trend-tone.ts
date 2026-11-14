import { formatPercentChange, trendOf } from "./dashboard-insights";

export type TrendDirection = "up" | "down" | "flat";

/** Whether a rise is good news (revenue, profit) or bad news (cancellations, costs). */
export type TrendPolarity = "higher-is-better" | "lower-is-better";

/** The color a change wears: good and bad follow the polarity, never the arrow alone. */
export type TrendTone = "good" | "bad" | "neutral";

export function trendTone(direction: TrendDirection, polarity: TrendPolarity): TrendTone {
  if (direction === "flat") {
    return "neutral";
  }
  const rose = direction === "up";
  const riseIsGood = polarity === "higher-is-better";
  return rose === riseIsGood ? "good" : "bad";
}

/** The word next to the arrow, so the direction never depends on color. */
export const TREND_WORDS: Record<TrendDirection, string> = {
  up: "Subiu",
  down: "Caiu",
  flat: "Igual",
};

export interface TrendTagParts {
  direction: TrendDirection;
  tone: TrendTone;
  word: string;
  /** Unsigned amount ("19%", "mais de 10×"); empty when nothing changed. */
  amount: string;
  /** Heard after the tag when the arrow alone carries the direction. */
  spoken?: string;
}

/**
 * What a tag shows for a change against the previous period: direction, its color by polarity, the
 * word and the unsigned percent. Null when there is nothing to compare with.
 */
export function trendTagParts(
  current: number | null,
  previous: number | null,
  polarity: TrendPolarity = "higher-is-better",
): TrendTagParts | null {
  const trend = trendOf(current, previous);
  if (trend === null) {
    return null;
  }
  return {
    direction: trend.direction,
    tone: trendTone(trend.direction, polarity),
    word: TREND_WORDS[trend.direction],
    amount: trendAmount(trend),
  };
}

function trendAmount(trend: NonNullable<ReturnType<typeof trendOf>>): string {
  if (trend.direction === "flat") {
    return "";
  }
  if (trend.isOffScale) {
    return "mais de 10×";
  }
  return formatPercentChange(trend.percent).replace("+", "");
}

const countFormat = new Intl.NumberFormat("pt-BR");

const SPOKEN_COUNT_CHANGE: Record<TrendDirection, string> = {
  up: "mais que no período anterior",
  down: "menos que no período anterior",
  flat: "o mesmo que no período anterior",
};

/**
 * A count that is bad news when it grows, such as cancellations: "↑ 3 cancelados" in red when
 * there were fewer before, green when fewer now. Null when there is none this period.
 */
export function countTagParts(
  current: number,
  previous: number,
  noun: { one: string; many: string },
): TrendTagParts | null {
  if (current <= 0) {
    return null;
  }
  const direction = directionOfCounts(current, previous);
  return {
    direction,
    tone: trendTone(direction, "lower-is-better"),
    word: `${countFormat.format(current)} ${current === 1 ? noun.one : noun.many}`,
    amount: "",
    spoken: SPOKEN_COUNT_CHANGE[direction],
  };
}

function directionOfCounts(current: number, previous: number): TrendDirection {
  if (current > previous) {
    return "up";
  }
  if (current < previous) {
    return "down";
  }
  return "flat";
}

const pointsFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/**
 * A margin's move in percentage points ("↑ Subiu 2,1 p.p."), rounded to one decimal; margins in
 * percent (37.5 for 37,5%). Null when either period has no margin.
 */
export function marginTagParts(
  current: number | null,
  previous: number | null,
): TrendTagParts | null {
  if (current === null || previous === null) {
    return null;
  }
  const delta = Math.round((current - previous) * 10) / 10;
  const direction = directionOfCounts(delta, 0);
  return {
    direction,
    tone: trendTone(direction, "higher-is-better"),
    word: TREND_WORDS[direction],
    amount: direction === "flat" ? "" : `${pointsFormat.format(Math.abs(delta))} p.p.`,
  };
}
