import { describe, expect, it, vi } from "vitest";

type ApprovalStatus = "pending" | "approved" | "refused";

const mocks = vi.hoisted(() => ({
  isActive: vi.fn<() => Promise<boolean>>(),
  approval: vi.fn<() => Promise<{ status: ApprovalStatus }>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  isSupplierActive: mocks.isActive,
  getSupplierApprovalState: mocks.approval,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
import {
  assertSupplierAcceptsProducts,
  SUPPLIER_OFF_MESSAGE,
  SUPPLIER_REFUSED_MESSAGE,
} from "./supplier-active-guard";

const supplierId = "b90fe97c-fd21-4ce8-ab70-908f233c7038";

function supplierThat(active: boolean, status: ApprovalStatus) {
  mocks.isActive.mockResolvedValue(active);
  mocks.approval.mockResolvedValue({ status });
}

describe("assertSupplierAcceptsProducts", () => {
  it("lets an active supplier add products", async () => {
    supplierThat(true, "approved");
    await expect(assertSupplierAcceptsProducts(supplierId)).resolves.toBeUndefined();
  });

  it("lets a supplier under review fill its catalog", async () => {
    supplierThat(true, "pending");
    await expect(assertSupplierAcceptsProducts(supplierId)).resolves.toBeUndefined();
  });

  it("refuses new products from a supplier switched off by its 3rd flag", async () => {
    supplierThat(false, "approved");
    await expect(assertSupplierAcceptsProducts(supplierId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: SUPPLIER_OFF_MESSAGE,
    });
  });

  it("refuses new products from a supplier whose sign-up the team refused", async () => {
    supplierThat(true, "refused");
    await expect(assertSupplierAcceptsProducts(supplierId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: SUPPLIER_REFUSED_MESSAGE,
    });
  });
});
