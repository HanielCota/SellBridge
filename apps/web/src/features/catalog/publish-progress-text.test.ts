import type { PublishProgress } from "@sellbridge/shared/publish-progress";
import { describe, expect, it } from "vitest";
import { progressCountText, remainingTimeText } from "./publish-progress-text";

function progress(remainingMilliseconds: number | null, done = 12): PublishProgress {
  return { done, total: 40, percent: Math.floor((done / 40) * 100), remainingMilliseconds };
}

describe("progressCountText", () => {
  it("reads as x de y with the percentage", () => {
    expect(progressCountText(progress(90_000))).toBe("12 de 40 · 30%");
  });
});

describe("remainingTimeText", () => {
  it("says it is still calculating before the first job finishes", () => {
    expect(remainingTimeText(progress(null, 0))).toBe("calculando o tempo restante…");
  });

  it("rounds the estimate to what a person plans around", () => {
    expect(remainingTimeText(progress(20_000))).toBe("menos de 1 min restante");
    expect(remainingTimeText(progress(4 * 60_000))).toBe("cerca de 4 min restantes");
    expect(remainingTimeText(progress(2 * 3_600_000))).toBe("cerca de 2 h restantes");
  });

  it("says it is done when nothing is left", () => {
    expect(remainingTimeText(progress(0, 40))).toBe("concluído");
  });
});
