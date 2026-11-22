import { describe, expect, it } from "vitest";
import { upgradeReference, upgradeUntil } from "./upgrade-reference";

const UNTIL = new Date("2026-12-20T03:00:00.000Z");

describe("upgrade difference reference", () => {
  it("reads back the end of the month the difference was worked out for", () => {
    const reference = upgradeReference("tenant-a", "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0", UNTIL);

    expect(reference).toBe("upgrade:tenant-a:0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0:1797735600000");
    expect(upgradeUntil(reference)).toEqual(UNTIL);
  });

  it.each([
    ["a reference from before the month was recorded", "upgrade:tenant-a:0b1c2d3e"],
    ["another kind of charge", "tenant-a:0b1c2d3e:1797735600000"],
    ["a garbled date", "upgrade:tenant-a:0b1c2d3e:17977356x0000"],
    ["no reference", null],
  ])("finds no month in %s", (_label, reference) => {
    expect(upgradeUntil(reference)).toBeNull();
  });
});
