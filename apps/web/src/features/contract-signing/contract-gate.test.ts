import { describe, expect, it } from "vitest";
import {
  CONTRACT_NOT_REQUIRED,
  needsContractSigning,
  sessionMaySign,
  showsSigningReminder,
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

  it("stops everything once signed", () => {
    const contract = toSessionContract({ kind: "signed" }, "seller");

    expect(needsContractSigning({ ...customer, contract }, false)).toBe(false);
    expect(showsSigningReminder({ ...customer, contract }, false)).toBe(false);
    expect(sessionMaySign({ ...customer, contract })).toBe(false);
  });
});
