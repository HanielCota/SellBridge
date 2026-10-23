import { describe, expect, it } from "vitest";
import { enterAccountAction } from "./enter-account";

const AGENT = { isSelf: false, canImpersonate: true, canManageCustomers: false };
const ADMIN = { isSelf: false, canImpersonate: true, canManageCustomers: true };

describe("enterAccountAction", () => {
  it("offers an agent the supplier's panel on an open supplier ticket", () => {
    expect(enterAccountAction({ ...AGENT, tenantKind: "supplier", ticketStatus: "open" })).toEqual(
      expect.objectContaining({ label: "Entrar como fornecedor", path: "/fornecedor/painel" }),
    );
  });

  it("offers an agent the reseller's overview on an answered ticket", () => {
    expect(
      enterAccountAction({ ...AGENT, tenantKind: "seller", ticketStatus: "answered" }),
    ).toEqual(expect.objectContaining({ label: "Entrar como cliente", path: "/dashboard" }));
  });

  it("hides it from an agent once the ticket is closed", () => {
    expect(
      enterAccountAction({ ...AGENT, tenantKind: "seller", ticketStatus: "closed" }),
    ).toBeNull();
  });

  it("keeps it for an admin on a closed ticket", () => {
    expect(
      enterAccountAction({ ...ADMIN, tenantKind: "seller", ticketStatus: "closed" }),
    ).not.toBeNull();
  });

  it("never offers it on one's own ticket or without the permission", () => {
    expect(
      enterAccountAction({ ...ADMIN, isSelf: true, tenantKind: "seller", ticketStatus: "open" }),
    ).toBeNull();
    expect(
      enterAccountAction({
        ...AGENT,
        canImpersonate: false,
        tenantKind: "seller",
        ticketStatus: "open",
      }),
    ).toBeNull();
  });
});
