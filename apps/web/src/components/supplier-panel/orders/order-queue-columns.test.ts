import { describe, expect, it } from "vitest";
import { queueColumnsFor } from "./order-queue-columns";

/*
 * TanStack's FlexRender mounts every `cell` and `header` function as a component type. A new
 * function per render remounted every cell, so a click landing mid-remount was lost or checked
 * the wrong row (selecting 233, 007 and 394 left only 233 checked).
 */
describe("queueColumnsFor", () => {
  it("keeps the same cell renderers between renders, so rows never remount", () => {
    for (const selectable of [true, false]) {
      const first = queueColumnsFor(selectable);
      const second = queueColumnsFor(selectable);
      expect(second).toBe(first);
      first.forEach((column, index) => {
        expect(second[index]?.cell).toBe(column.cell);
        expect(second[index]?.header).toBe(column.header);
      });
    }
  });

  it("adds the selection column only where orders can be accepted", () => {
    expect(queueColumnsFor(true).map((column) => column.id)).toEqual([
      "select",
      "order",
      "status",
      "action",
    ]);
    expect(queueColumnsFor(false).map((column) => column.id)).toEqual([
      "order",
      "status",
      "action",
    ]);
  });
});
