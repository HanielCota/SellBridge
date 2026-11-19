import { describe, expect, it } from "vitest";
import {
  CNPJ_LOOKUP_RETRY_WINDOW_IN_MS,
  decideSupplierApproval,
  legalNamesMatch,
  nextCnpjCheck,
  supplierApprovalDecisionSchema,
  type ApprovalFacts,
  type CnpjCheck,
} from "./supplier-approval.ts";

const CNPJ = "11222333000181";
const NOW = new Date("2026-11-18T12:00:00.000Z");
const COMPANY = { cnpj: CNPJ, legalName: "Casa das Panelas Ltda" };

function check(overrides: Partial<CnpjCheck> = {}): CnpjCheck {
  return {
    cnpj: CNPJ,
    outcome: "active",
    legalName: "CASA DAS PANELAS LTDA",
    registrationStatus: "ATIVA",
    checkedAt: NOW,
    unavailableSince: null,
    ...overrides,
  };
}

function facts(overrides: Partial<ApprovalFacts> = {}): ApprovalFacts {
  return {
    company: COMPANY,
    check: check(),
    receivingAccountApproved: false,
    requireReceivingAccount: false,
    now: NOW,
    ...overrides,
  };
}

function minutesLater(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60 * 1000);
}

describe("decideSupplierApproval", () => {
  it("approves an active CNPJ with the same legal name while the account is not required", () => {
    const verdict = decideSupplierApproval(facts());

    expect(verdict).toEqual({ kind: "approve" });
  });

  it("waits for the company data before asking the Receita", () => {
    const verdict = decideSupplierApproval(facts({ company: null, check: null }));

    expect(verdict).toEqual({ kind: "wait_supplier", missing: ["company_data"] });
  });

  it("lists the receiving account too when the switch requires it", () => {
    const verdict = decideSupplierApproval(
      facts({ company: null, check: null, requireReceivingAccount: true }),
    );

    expect(verdict).toEqual({
      kind: "wait_supplier",
      missing: ["company_data", "receiving_account"],
    });
  });

  it("asks the Receita when the CNPJ was never checked", () => {
    const verdict = decideSupplierApproval(facts({ check: null }));

    expect(verdict).toEqual({ kind: "lookup" });
  });

  it("asks the Receita again when the supplier changed the CNPJ", () => {
    const verdict = decideSupplierApproval(facts({ check: check({ cnpj: "11444777000161" }) }));

    expect(verdict).toEqual({ kind: "lookup" });
  });

  it("sends an inactive CNPJ to the team", () => {
    const verdict = decideSupplierApproval(
      facts({ check: check({ outcome: "inactive", registrationStatus: "BAIXADA" }) }),
    );

    expect(verdict).toEqual({ kind: "needs_team", reason: "cnpj_inactive" });
  });

  it("sends a CNPJ the Receita does not know to the team", () => {
    const verdict = decideSupplierApproval(
      facts({ check: check({ outcome: "not_found", legalName: null }) }),
    );

    expect(verdict).toEqual({ kind: "needs_team", reason: "cnpj_not_found" });
  });

  it("sends a CNPJ the query refuses to the team", () => {
    const verdict = decideSupplierApproval(
      facts({ check: check({ outcome: "unsupported", legalName: null }) }),
    );

    expect(verdict).toEqual({ kind: "needs_team", reason: "cnpj_unsupported" });
  });

  it("sends another company's legal name to the team", () => {
    const verdict = decideSupplierApproval(
      facts({ check: check({ legalName: "OUTRA EMPRESA DE PANELAS LTDA" }) }),
    );

    expect(verdict).toEqual({ kind: "needs_team", reason: "legal_name_mismatch" });
  });

  it("keeps retrying a query that is down within the first hour", () => {
    const down = check({ outcome: "unavailable", legalName: null, unavailableSince: NOW });

    const verdict = decideSupplierApproval(facts({ check: down, now: minutesLater(59) }));

    expect(verdict).toEqual({ kind: "lookup" });
  });

  it("hands the supplier to the team once the query has been down for an hour", () => {
    const down = check({ outcome: "unavailable", legalName: null, unavailableSince: NOW });

    const verdict = decideSupplierApproval(
      facts({ check: down, now: new Date(NOW.getTime() + CNPJ_LOOKUP_RETRY_WINDOW_IN_MS) }),
    );

    expect(verdict).toEqual({ kind: "needs_team", reason: "lookup_unavailable" });
  });

  it("waits for an approved receiving account when the switch is on", () => {
    const verdict = decideSupplierApproval(facts({ requireReceivingAccount: true }));

    expect(verdict).toEqual({ kind: "wait_supplier", missing: ["receiving_account"] });
  });

  it("approves with the switch on once the receiving account is approved", () => {
    const verdict = decideSupplierApproval(
      facts({ requireReceivingAccount: true, receivingAccountApproved: true }),
    );

    expect(verdict).toEqual({ kind: "approve" });
  });
});

describe("legalNamesMatch", () => {
  it("ignores accents, case, punctuation and the company type", () => {
    expect(legalNamesMatch("Utensílios São João Ltda.", "UTENSILIOS SAO JOAO LTDA")).toBe(true);
    expect(legalNamesMatch("Panelas Brasil S/A", "PANELAS BRASIL S.A.")).toBe(true);
  });

  it("ignores the CPF an MEI carries at the Receita", () => {
    expect(legalNamesMatch("Maria da Silva", "MARIA DA SILVA 12345678901")).toBe(true);
  });

  it("tells two companies apart", () => {
    expect(legalNamesMatch("Panelas Brasil", "PANELAS DO BRASIL")).toBe(false);
  });

  it("never matches an empty name", () => {
    expect(legalNamesMatch("LTDA", "LTDA")).toBe(false);
  });
});

describe("nextCnpjCheck", () => {
  it("keeps when the query started failing across retries", () => {
    const first = nextCnpjCheck(CNPJ, { outcome: "unavailable" }, null, NOW);

    const second = nextCnpjCheck(CNPJ, { outcome: "unavailable" }, first, minutesLater(15));

    expect(second.unavailableSince).toEqual(NOW);
    expect(second.checkedAt).toEqual(minutesLater(15));
  });

  it("restarts the hour when the failing CNPJ was another one", () => {
    const other = nextCnpjCheck("11444777000161", { outcome: "unavailable" }, null, NOW);

    const next = nextCnpjCheck(CNPJ, { outcome: "unavailable" }, other, minutesLater(30));

    expect(next.unavailableSince).toEqual(minutesLater(30));
  });

  it("clears the failure once the query answers", () => {
    const down = nextCnpjCheck(CNPJ, { outcome: "unavailable" }, null, NOW);

    const answered = nextCnpjCheck(
      CNPJ,
      { outcome: "active", legalName: "CASA DAS PANELAS LTDA", registrationStatus: "ATIVA" },
      down,
      minutesLater(15),
    );

    expect(answered).toMatchObject({
      outcome: "active",
      legalName: "CASA DAS PANELAS LTDA",
      unavailableSince: null,
    });
  });
});

describe("supplierApprovalDecisionSchema", () => {
  const supplierId = "8d0c0a52-3b4f-4bb0-9a49-2f1f5d1f7c11";

  it("asks for a reason the supplier can read when refusing", () => {
    const parsed = supplierApprovalDecisionSchema.safeParse({
      supplierId,
      decision: "refuse",
      reason: "não",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts an approval without a reason", () => {
    const parsed = supplierApprovalDecisionSchema.safeParse({ supplierId, decision: "approve" });

    expect(parsed.success).toBe(true);
  });
});
