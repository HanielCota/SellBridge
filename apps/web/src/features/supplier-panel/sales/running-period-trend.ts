import type { TrendTagParts } from "@/features/reports/trend-tone";

/** What the change is measured against, said next to it. */
export function versusText(running: boolean): string {
  return running ? "sobre os mesmos dias do anterior" : "sobre o anterior";
}

/**
 * A period still running is not over: a drop so far is told in words and arrow, but not in red,
 * since the days left can still turn it (no alarm without a reason).
 */
export function runningPeriodTrend(
  parts: TrendTagParts | null,
  running: boolean,
): TrendTagParts | null {
  if (parts === null || parts.tone !== "bad") {
    return parts;
  }
  return running ? { ...parts, tone: "neutral" } : parts;
}
