import { describe, expect, it } from "vitest";
import {
  CONTRACT_NOT_REQUIRED,
  isContractGateFreePath,
  needsContractSigning,
  sessionContractOf,
  sessionMaySign,
  showsSigningReminder,
  supplierContractAccess,
  toSessionContract,
} from "./contract-gate";

const DEADLINE = new Date("2026-12-31T12:00:00Z");
const customer = { impersonatedBy: null };
const visit = { impersonatedBy: "admin-1" };

// Contracts, section 1: with the switch off nobody is sent anywhere; an admin's visit never signs.
describe("contract gate", () => {
  it("sends nobody to the signing screen while the switch is off", () => {
    const session = { ...customer, contract: CONTRACT_NOT_REQUIRED };

    expect(needsContractSigning(session, false)).toBe(false);
    expect(showsSigningReminder(session, false)).toBe(false);
    expect(sessionMaySign(session)).toBe(false);
  });

  it("sends a new profile straight to the signing screen", () => {
    const contract = toSessionContract({ kind: "must_sign" }, "supplier");

    expect(needsContractSigning({ ...customer, contract }, false)).toBe(true);
    expect(showsSigningReminder({ ...customer, contract }, false)).toBe(false);
  });

  it("only reminds during the 30 days, with the deadline", () => {
    const contract = toSessionContract({ kind: "grace", deadline: DEADLINE }, "seller");

    expect(contract.deadline).toBe("2026-12-31T12:00:00.000Z");
    expect(needsContractSigning({ ...customer, contract }, false)).toBe(false);
    expect(showsSigningReminder({ ...customer, contract }, false)).toBe(true);
    expect(sessionMaySign({ ...customer, contract })).toBe(true);
  });

  it("holds a seller past the deadline and only reminds a supplier", () => {
    const seller = toSessionContract({ kind: "overdue", deadline: DEADLINE }, "seller");
    const supplier = toSessionContract({ kind: "overdue", deadline: DEADLINE }, "supplier");

    expect(needsContractSigning({ ...customer, contract: seller }, false)).toBe(true);
    expect(needsContractSigning({ ...customer, contract: supplier }, false)).toBe(false);
    expect(showsSigningReminder({ ...customer, contract: supplier }, false)).toBe(true);
  });

  it("never sends or reminds an admin visiting the customer", () => {
    const contract = toSessionContract({ kind: "must_sign" }, "seller");

    expect(needsContractSigning({ ...visit, contract }, false)).toBe(false);
    expect(sessionMaySign({ ...visit, contract })).toBe(false);
  });

  it("never holds or reminds on the team pages, even a team member past the deadline", () => {
    const contract = toSessionContract({ kind: "overdue", deadline: DEADLINE }, "seller");

    expect(needsContractSigning({ ...customer, contract }, true)).toBe(false);
    expect(showsSigningReminder({ ...customer, contract }, true)).toBe(false);
  });

  it("lets a held person open support and the team tools, nothing else", () => {
    expect(isContractGateFreePath("/suporte")).toBe(true);
    expect(isContractGateFreePath("/suporte/novo")).toBe(true);
    expect(isContractGateFreePath("/admin/chamados")).toBe(true);
    expect(isContractGateFreePath("/dashboard")).toBe(false);
    expect(isContractGateFreePath("/suportes")).toBe(false);
  });

  // Production, 21/11/2026: during and right after the deploy, the panel broke with "Cannot read
  // properties of undefined" because a server of the previous version answered without `contract`.
  it("treats a session without the contract field as not required, without breaking", () => {
    const fromPreviousServer = { impersonatedBy: null };

    expect(needsContractSigning(fromPreviousServer, false)).toBe(false);
    expect(showsSigningReminder(fromPreviousServer, false)).toBe(false);
    expect(sessionMaySign(fromPreviousServer)).toBe(false);
    expect(sessionContractOf(fromPreviousServer)).toEqual(CONTRACT_NOT_REQUIRED);
  });

  it("stops everything once signed", () => {
    const contract = toSessionContract({ kind: "signed" }, "seller");

    expect(needsContractSigning({ ...customer, contract }, false)).toBe(false);
    expect(showsSigningReminder({ ...customer, contract }, false)).toBe(false);
    expect(sessionMaySign({ ...customer, contract })).toBe(false);
  });
});

// The supplier contract states SellBridge's 4%, which the client keeps from resellers (22/11/2026).
describe("supplier contract page", () => {
  const supplierProfile = { slug: "fornecedor-1", kind: "supplier" as const };
  const sellerProfile = { slug: "loja-1", kind: "seller" as const };

  it("sends an anonymous visitor to the login", () => {
    expect(supplierContractAccess(null)).toBe("sign_in");
  });

  it("keeps the text from a reseller", () => {
    const reseller = { user: { role: "user" }, profiles: [sellerProfile] };

    expect(supplierContractAccess(reseller)).toBe("not_supplier");
  });

  it("keeps the text from an account with no profile yet", () => {
    expect(supplierContractAccess({ user: { role: "user" }, profiles: [] })).toBe("not_supplier");
  });

  it("opens for an account with a supplier profile, even on its reseller tab", () => {
    const supplier = { user: { role: "user" }, profiles: [sellerProfile, supplierProfile] };

    expect(supplierContractAccess(supplier)).toBe("allowed");
  });

  it("opens for every team role, with or without a profile", () => {
    for (const role of ["agent", "supervisor", "admin"]) {
      expect(supplierContractAccess({ user: { role }, profiles: [] })).toBe("allowed");
    }
  });
});
