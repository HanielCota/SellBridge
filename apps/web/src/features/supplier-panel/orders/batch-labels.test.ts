import { describe, expect, it } from "vitest";
import { type LabelCandidate, labelRefusal, planLabelBatch } from "./batch-labels";

const candidate: LabelCandidate = {
  id: "s1",
  orderId: "o1",
  tenantId: "t1",
  status: "accepted",
  orderStatus: "paid",
  storeId: "store-a",
  shopName: "Ana Moda",
  marketplace: "mercado_livre",
};

describe("labelRefusal", () => {
  it("asks the marketplace for a Mercado Livre parcel still in the supplier's hands", () => {
    expect(labelRefusal(candidate)).toBeNull();
  });

  it("refuses a parcel of another channel", () => {
    expect(labelRefusal({ ...candidate, marketplace: "shopee" })).toMatch(/própria/);
  });

  it("refuses a parcel that already left", () => {
    expect(labelRefusal({ ...candidate, status: "shipped" })).toMatch(/já saiu/);
  });

  it("refuses a sale not released for shipping", () => {
    expect(labelRefusal({ ...candidate, orderStatus: "cancelled" })).toMatch(/liberação/);
  });

  it("refuses a parcel that is not the supplier's", () => {
    expect(labelRefusal(undefined)).toMatch(/fora da sua lista/);
  });
});

describe("planLabelBatch", () => {
  it("groups the printable parcels by reseller store and reports the others", () => {
    const other = { ...candidate, id: "s2", orderId: "o2", storeId: "store-b" };
    const same = { ...candidate, id: "s3", orderId: "o3" };

    const plan = planLabelBatch(["s1", "s2", "s3", "missing"], [candidate, other, same]);

    expect(plan.stores.map((group) => group.map((item) => item.id))).toEqual([
      ["s1", "s3"],
      ["s2"],
    ]);
    expect(plan.refused).toEqual([
      { shipmentId: "missing", printed: false, reason: expect.stringMatching(/fora da sua lista/) },
    ]);
  });
});
