import { describe, expect, it } from "vitest";
import { revealScrollLeft } from "./use-active-indicator";

const TRACK = { scrollLeft: 0, clientWidth: 300 };

describe("revealScrollLeft", () => {
  it("scrolls a new choice past the end into view", () => {
    expect(revealScrollLeft(TRACK, { offsetLeft: 400, offsetWidth: 50 }, true)).toBe(150);
  });

  it("scrolls a new choice before the start into view", () => {
    const scrolled = { scrollLeft: 200, clientWidth: 300 };

    expect(revealScrollLeft(scrolled, { offsetLeft: 0, offsetWidth: 60 }, true)).toBe(0);
  });

  it("stays put when the new choice is already visible", () => {
    expect(revealScrollLeft(TRACK, { offsetLeft: 100, offsetWidth: 50 }, true)).toBeNull();
  });

  it("keeps a track the person scrolled when only the layout changed", () => {
    const scrolledToTheEnd = { scrollLeft: 220, clientWidth: 300 };

    expect(
      revealScrollLeft(scrolledToTheEnd, { offsetLeft: 0, offsetWidth: 60 }, false),
    ).toBeNull();
  });
});
