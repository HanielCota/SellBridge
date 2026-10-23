import { describe, expect, it } from "vitest";
import { STATE_OPTIONS } from "./supplier-state-select";

describe("STATE_OPTIONS", () => {
  it("offers all 27 Brazilian states in alphabetical order", () => {
    expect(STATE_OPTIONS).toHaveLength(27);
    expect(STATE_OPTIONS).toEqual(STATE_OPTIONS.toSorted());
    expect(STATE_OPTIONS.slice(0, 4)).toEqual(["AC", "AL", "AM", "AP"]);
    expect(STATE_OPTIONS).toContain("TO");
  });
});
