import { describe, expect, it } from "vitest";
import { hiddenEdgesOf, scrollEdgeMask } from "./use-scroll-edges";

describe("hiddenEdgesOf", () => {
  it("says nothing hides when everything fits", () => {
    expect(hiddenEdgesOf(0, 300, 300)).toEqual({ start: false, end: false });
  });

  it("says more hides past the end at the start of a long track", () => {
    expect(hiddenEdgesOf(0, 300, 520)).toEqual({ start: false, end: true });
  });

  it("says content hides on both sides in the middle", () => {
    expect(hiddenEdgesOf(100, 300, 520)).toEqual({ start: true, end: true });
  });

  it("ignores a pixel of rounding at the end", () => {
    expect(hiddenEdgesOf(219.5, 300, 520)).toEqual({ start: true, end: false });
  });
});

describe("scrollEdgeMask", () => {
  it("fades nothing when nothing hides", () => {
    expect(scrollEdgeMask({ start: false, end: false })).toBeUndefined();
  });

  it("fades only the side that hides content", () => {
    expect(scrollEdgeMask({ start: false, end: true })).toContain("transparent)");
    expect(scrollEdgeMask({ start: true, end: false })).toMatch(
      /^linear-gradient\(to right, transparent/,
    );
  });
});
