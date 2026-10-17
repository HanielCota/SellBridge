import { describe, expect, it } from "vitest";
import { toggled, withAll } from "./selection";

const rowA = { id: "a" };
const rowB = { id: "b" };
const rowC = { id: "c" };

function toggleAll(order: readonly { id: string }[]) {
  return order.reduce<ReadonlyMap<string, { id: string }>>(toggled, new Map());
}

describe("batch selection", () => {
  it("keeps exactly the three toggled rows, whatever the order", () => {
    const orders = [
      [rowA, rowB, rowC],
      [rowC, rowA, rowB],
      [rowB, rowC, rowA],
      [rowA, rowC, rowB],
    ];
    for (const order of orders) {
      expect([...toggleAll(order).keys()].toSorted()).toEqual(["a", "b", "c"]);
    }
  });

  it("drops only the row toggled again", () => {
    const selected = toggled(toggleAll([rowA, rowB, rowC]), rowB);
    expect([...selected.keys()].toSorted()).toEqual(["a", "c"]);
  });

  it("selects and clears a whole page without touching other rows", () => {
    const selected = withAll(new Map([["a", rowA]]), [rowB, rowC], true);
    expect([...selected.keys()].toSorted()).toEqual(["a", "b", "c"]);
    expect([...withAll(selected, [rowB, rowC], false).keys()]).toEqual(["a"]);
  });
});
