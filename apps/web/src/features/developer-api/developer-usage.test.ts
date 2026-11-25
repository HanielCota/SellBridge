import { describe, expect, it } from "vitest";
import { describeDeveloperUse } from "./developer-usage";

describe("describeDeveloperUse", () => {
  it("names the organization, the order and the personal data of an order read", () => {
    const use = describeDeveloperUse({
      params: { organizationId: "org-1", orderId: "order-9" },
      status: 200,
      sendsPersonalData: true,
    });

    expect(use).toEqual({ organizationId: "org-1", resourceId: "order-9", personalData: true });
  });

  it("does not count personal data on a refused call", () => {
    const use = describeDeveloperUse({
      params: { organizationId: "org-1", orderId: "order-9" },
      status: 403,
      sendsPersonalData: true,
    });

    expect(use.personalData).toBe(false);
  });

  it("keeps the supplier as the record when no organization is in the path", () => {
    const use = describeDeveloperUse({
      params: { supplierId: "supplier-3" },
      status: 200,
      sendsPersonalData: false,
    });

    expect(use).toEqual({ organizationId: null, resourceId: "supplier-3", personalData: false });
  });

  it("cuts an oversized id instead of storing it whole", () => {
    const use = describeDeveloperUse({
      params: { organizationId: "x".repeat(500) },
      status: 404,
      sendsPersonalData: false,
    });

    expect(use.organizationId).toHaveLength(100);
  });
});
