import { isAppError } from "@sellbridge/shared/errors";
import { describe, expect, it } from "vitest";
import { assertSupplierPanelAccess, assertSellerProfile } from "./supplier-panel-access.ts";

const OWN_SUPPLIER = "8f1c2a3e-1111-4c2d-9e10-000000000001";
const OTHER_SUPPLIER = "8f1c2a3e-2222-4c2d-9e10-000000000002";

function refusalOf(action: () => void): { code: string; message: string } | null {
  try {
    action();
    return null;
  } catch (error) {
    if (!isAppError(error)) {
      throw error;
    }
    return { code: error.code, message: error.userMessage };
  }
}

describe("assertSupplierPanelAccess", () => {
  it("lets the team act for any supplier", () => {
    expect(refusalOf(() => assertSupplierPanelAccess({ kind: "team" }, OTHER_SUPPLIER))).toBeNull();
  });

  it("lets a supplier profile act only on its own supplier", () => {
    const viewer = { kind: "supplier", supplierId: OWN_SUPPLIER } as const;

    expect(refusalOf(() => assertSupplierPanelAccess(viewer, OWN_SUPPLIER))).toBeNull();
    expect(refusalOf(() => assertSupplierPanelAccess(viewer, OTHER_SUPPLIER))).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("asks a supplier profile without a brand to set it up first", () => {
    const viewer = { kind: "supplier", supplierId: null } as const;

    expect(refusalOf(() => assertSupplierPanelAccess(viewer, OWN_SUPPLIER))).toEqual({
      code: "FORBIDDEN",
      message: "Cadastre sua marca para usar o painel do fornecedor.",
    });
  });

  it("refuses the supplier panel to a seller profile with 403", () => {
    expect(
      refusalOf(() => assertSupplierPanelAccess({ kind: "seller" }, OWN_SUPPLIER)),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("assertSellerProfile", () => {
  it("lets a seller profile through", () => {
    expect(refusalOf(() => assertSellerProfile("seller"))).toBeNull();
  });

  it("refuses seller functions to a supplier profile with 403", () => {
    expect(refusalOf(() => assertSellerProfile("supplier"))).toEqual({
      code: "FORBIDDEN",
      message: "Esta área é do perfil de vendedor. Use o painel do fornecedor.",
    });
  });
});
