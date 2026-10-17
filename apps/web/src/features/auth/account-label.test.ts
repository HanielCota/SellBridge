import { describe, expect, it } from "vitest";
import { accountLabel } from "./account-label.ts";

describe("accountLabel", () => {
  it("calls a customer on a supplier profile a supplier", () => {
    expect(accountLabel("user", "supplier")).toBe("Fornecedor");
  });

  it("keeps calling a customer on a seller profile a reseller", () => {
    expect(accountLabel("user", "seller")).toBe("Revendedor");
  });

  it("shows the team role whatever the profile", () => {
    expect(accountLabel("admin", "supplier")).toBe("Administrador");
  });
});
