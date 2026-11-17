import { describe, expect, it } from "vitest";
import {
  madeToOrderDaysSchema,
  productVideoUrlSchema,
  warrantyDaysSchema,
  youtubeVideoId,
} from "./product-sale-terms";

describe("youtubeVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc123DEF45", "abc123DEF45"],
    ["https://youtube.com/watch?v=abc123DEF45&t=10s", "abc123DEF45"],
    ["https://m.youtube.com/watch?v=abc123DEF45", "abc123DEF45"],
    ["https://youtu.be/abc123DEF45", "abc123DEF45"],
    ["https://www.youtube.com/shorts/abc123DEF45", "abc123DEF45"],
    [" https://youtu.be/abc123DEF45 ", "abc123DEF45"],
  ])("reads the id of %s", (link, id) => {
    expect(youtubeVideoId(link)).toBe(id);
  });

  it.each([
    "http://youtu.be/abc123DEF45",
    "https://vimeo.com/123456",
    "https://www.youtube.com/watch?v=curto",
    "https://youtube.com.golpe.test/watch?v=abc123DEF45",
    "abc123DEF45",
    "",
  ])("refuses %j", (link) => {
    expect(youtubeVideoId(link)).toBeNull();
  });
});

describe("sale terms limits", () => {
  it("takes a warranty from 1 to 3650 days", () => {
    expect(warrantyDaysSchema.safeParse(90).success).toBe(true);
    expect(warrantyDaysSchema.safeParse(0).success).toBe(false);
    expect(warrantyDaysSchema.safeParse(3651).success).toBe(false);
    expect(warrantyDaysSchema.safeParse(Number.NaN).success).toBe(false);
  });

  it("takes a made-to-order time from 1 to 60 days", () => {
    expect(madeToOrderDaysSchema.safeParse(60).success).toBe(true);
    expect(madeToOrderDaysSchema.safeParse(61).success).toBe(false);
    expect(madeToOrderDaysSchema.safeParse(2.5).success).toBe(false);
  });

  it("names the YouTube format when the link is from somewhere else", () => {
    const parsed = productVideoUrlSchema.safeParse("https://vimeo.com/123");

    expect(parsed.error?.issues[0]?.message).toContain("YouTube");
  });
});
