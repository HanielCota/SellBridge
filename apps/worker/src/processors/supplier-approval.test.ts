import { describe, expect, it } from "vitest";
import { createSupplierApprovalProcessor, SUPPLIERS_PER_ROUND } from "./supplier-approval.ts";

describe("createSupplierApprovalProcessor", () => {
  it("checks every pending supplier of the round and counts the approved ones", async () => {
    const checked: string[] = [];
    let askedLimit = 0;
    const process = createSupplierApprovalProcessor({
      listPending: async (limit) => {
        askedLimit = limit;
        return ["a", "b", "c"];
      },
      check: async (supplierId) => {
        checked.push(supplierId);
        return supplierId === "b" ? "approved" : "pending";
      },
    });

    const result = await process();

    expect(askedLimit).toBe(SUPPLIERS_PER_ROUND);
    expect(checked).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ checked: 3, approved: 1 });
  });

  it("keeps going when one supplier's check fails", async () => {
    const checked: string[] = [];
    const process = createSupplierApprovalProcessor({
      listPending: async () => ["a", "b"],
      check: async (supplierId) => {
        checked.push(supplierId);
        if (supplierId === "a") {
          throw new Error("database timeout");
        }
        return "approved";
      },
    });

    const result = await process();

    expect(checked).toEqual(["a", "b"]);
    expect(result).toEqual({ checked: 2, approved: 1 });
  });
});
