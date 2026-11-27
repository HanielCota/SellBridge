import { describe, expect, it } from "vitest";
import { chipListView } from "./collapsible-filter-chips";

describe("chipListView", () => {
  it("shows only the first row while collapsed and the choice is on it", () => {
    expect(chipListView({ expanded: false, chosenIndex: 2, firstRowCount: 6 })).toEqual({
      kind: "firstRow",
    });
  });

  it("opens every row when the chosen chip sits past the first row", () => {
    expect(chipListView({ expanded: false, chosenIndex: 9, firstRowCount: 6 })).toEqual({
      kind: "all",
      canCollapse: false,
    });
  });

  it("lets an opened list collapse again while the choice is on the first row", () => {
    expect(chipListView({ expanded: true, chosenIndex: 0, firstRowCount: 6 })).toEqual({
      kind: "all",
      canCollapse: true,
    });
  });

  it("treats a choice that is not in the list as visible", () => {
    expect(chipListView({ expanded: false, chosenIndex: -1, firstRowCount: 6 })).toEqual({
      kind: "firstRow",
    });
  });
});
