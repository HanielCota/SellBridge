import { describe, expect, it } from "vitest";
import type { TrendTagParts } from "@/features/reports/trend-tone";
import { runningPeriodTrend, versusText } from "./running-period-trend";

const DROP: TrendTagParts = { direction: "down", tone: "bad", word: "Caiu", amount: "3%" };

describe("runningPeriodTrend", () => {
  it("shows a drop of a month still running without the red alarm", () => {
    expect(runningPeriodTrend(DROP, true)?.tone).toBe("neutral");
  });

  it("keeps the red for a drop of a period already over", () => {
    expect(runningPeriodTrend(DROP, false)?.tone).toBe("bad");
  });

  it("keeps good news green while the period runs", () => {
    const rise: TrendTagParts = { ...DROP, direction: "up", tone: "good", word: "Subiu" };

    expect(runningPeriodTrend(rise, true)?.tone).toBe("good");
  });
});

describe("versusText", () => {
  it("says the change is against the same days while the period runs", () => {
    expect(versusText(true)).toBe("sobre os mesmos dias do anterior");
    expect(versusText(false)).toBe("sobre o anterior");
  });
});
