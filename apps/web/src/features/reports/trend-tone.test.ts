import { describe, expect, it } from "vitest";
import { countTagParts, marginTagParts, trendTagParts, trendTone } from "./trend-tone";

describe("trendTone", () => {
  it("colors a rise as good when more is better", () => {
    expect(trendTone("up", "higher-is-better")).toBe("good");
  });

  it("colors a fall as bad when more is better", () => {
    expect(trendTone("down", "higher-is-better")).toBe("bad");
  });

  it("colors a rise as bad when less is better, like cancellations", () => {
    expect(trendTone("up", "lower-is-better")).toBe("bad");
  });

  it("colors a fall as good when less is better, like costs", () => {
    expect(trendTone("down", "lower-is-better")).toBe("good");
  });

  it("keeps no change neutral whatever the polarity", () => {
    expect(trendTone("flat", "higher-is-better")).toBe("neutral");
    expect(trendTone("flat", "lower-is-better")).toBe("neutral");
  });
});

describe("trendTagParts", () => {
  it("says the revenue rose, in green, with the unsigned percent", () => {
    expect(trendTagParts(11_900, 10_000)).toEqual({
      direction: "up",
      tone: "good",
      word: "Subiu",
      amount: "19%",
    });
  });

  it("says the revenue fell, in red", () => {
    expect(trendTagParts(9_100, 10_000)).toMatchObject({
      direction: "down",
      tone: "bad",
      word: "Caiu",
      amount: "9%",
    });
  });

  it("paints more cancellations red even though the arrow points up", () => {
    expect(trendTagParts(4, 2, "lower-is-better")).toMatchObject({
      direction: "up",
      tone: "bad",
      word: "Subiu",
    });
  });

  it("says nothing changed without an amount", () => {
    expect(trendTagParts(500, 500)).toEqual({
      direction: "flat",
      tone: "neutral",
      word: "Igual",
      amount: "",
    });
  });

  it("names a huge jump instead of a meaningless percent", () => {
    expect(trendTagParts(100_000, 10)?.amount).toBe("mais de 10×");
  });

  it("has no tag when there is nothing to compare with", () => {
    expect(trendTagParts(100, null)).toBeNull();
    expect(trendTagParts(100, 0)).toBeNull();
  });
});

describe("countTagParts", () => {
  const cancelled = { one: "cancelado", many: "cancelados" };

  it("shows more cancellations than before in red, pointing up", () => {
    expect(countTagParts(3, 1, cancelled)).toMatchObject({
      direction: "up",
      tone: "bad",
      word: "3 cancelados",
    });
  });

  it("shows fewer cancellations than before in green, pointing down", () => {
    expect(countTagParts(1, 4, cancelled)).toMatchObject({
      direction: "down",
      tone: "good",
      word: "1 cancelado",
    });
  });

  it("keeps the same number of cancellations neutral", () => {
    expect(countTagParts(2, 2, cancelled)?.tone).toBe("neutral");
  });

  it("has no tag when nothing was cancelled this period", () => {
    expect(countTagParts(0, 5, cancelled)).toBeNull();
  });
});

describe("marginTagParts", () => {
  it("says the margin rose in percentage points", () => {
    expect(marginTagParts(37.5, 35.4)).toEqual({
      direction: "up",
      tone: "good",
      word: "Subiu",
      amount: "2,1 p.p.",
    });
  });

  it("says the margin fell, in red", () => {
    expect(marginTagParts(30, 32)).toMatchObject({ direction: "down", tone: "bad" });
  });

  it("calls a change below a tenth of a point no change", () => {
    expect(marginTagParts(30.02, 30)).toMatchObject({ direction: "flat", amount: "" });
  });

  it("has no tag when a period has no margin", () => {
    expect(marginTagParts(null, 30)).toBeNull();
  });
});
