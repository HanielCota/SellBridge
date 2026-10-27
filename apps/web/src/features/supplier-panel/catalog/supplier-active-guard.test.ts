import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isActive: vi.fn<() => Promise<boolean>>() }));
vi.mock("@sellbridge/database/repositories", () => ({ isSupplierActive: mocks.isActive }));
vi.mock("@/lib/server/database", () => ({ database: {} }));
import { assertSupplierAcceptsProducts, SUPPLIER_OFF_MESSAGE } from "./supplier-active-guard";

const supplierId = "b90fe97c-fd21-4ce8-ab70-908f233c7038";

describe("assertSupplierAcceptsProducts", () => {
  it("lets an active supplier add products", async () => {
    mocks.isActive.mockResolvedValue(true);
    await expect(assertSupplierAcceptsProducts(supplierId)).resolves.toBeUndefined();
  });

  it("refuses new products from a supplier switched off by its 3rd flag", async () => {
    mocks.isActive.mockResolvedValue(false);
    await expect(assertSupplierAcceptsProducts(supplierId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: SUPPLIER_OFF_MESSAGE,
    });
  });
});
