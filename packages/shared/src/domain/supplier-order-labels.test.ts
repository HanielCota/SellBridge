import { describe, expect, it } from "vitest";
import { type LabelRecord, supplierLabelState } from "./supplier-order-labels.ts";

const record: LabelRecord = {
  marketplace: "mercado_livre",
  status: "accepted",
  labelPrintCount: 0,
  labelWaitingSince: null,
  overdue: false,
};

describe("supplierLabelState", () => {
  it("says pending for a label never emitted within the time", () => {
    expect(supplierLabelState(record)).toBe("pending");
  });

  it("says late for a label never emitted past the dispatch time", () => {
    expect(supplierLabelState({ ...record, overdue: true })).toBe("late");
  });

  it("says printed once the label was emitted, even past the time", () => {
    expect(supplierLabelState({ ...record, labelPrintCount: 2, overdue: true })).toBe("printed");
  });

  it("says waiting while the marketplace has not released the label", () => {
    const waiting = { ...record, labelWaitingSince: new Date("2026-11-04T12:00:00Z") };

    expect(supplierLabelState({ ...waiting, overdue: true })).toBe("waiting");
  });

  it("has no label state for other channels", () => {
    expect(supplierLabelState({ ...record, marketplace: "shopee" })).toBeNull();
  });

  it("has no label state once the parcel left", () => {
    expect(supplierLabelState({ ...record, status: "shipped" })).toBeNull();
  });
});
