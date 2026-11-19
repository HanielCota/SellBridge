import { describe, expect, it } from "vitest";
import {
  claimBadge,
  claimNextStep,
  claimReason,
  claimResolution,
  claimReturnLines,
  claimTitle,
  type ClaimView,
  sortClaims,
} from "./claim-view";

function claim(overrides: Partial<ClaimView> = {}): ClaimView {
  return {
    externalClaimId: "5256749420",
    status: "opened",
    type: "mediations",
    stage: "claim",
    reasonId: "PDD9549",
    problem: "O produto chegou quebrado",
    actionResponsible: "seller",
    // 19/11 at 23:30 in São Paulo is already 20/11 in UTC.
    actionDueAt: new Date("2026-11-20T02:30:00.000Z"),
    resolutionReason: null,
    closedAt: null,
    returnStatus: null,
    returnTrackingCode: null,
    returnDestination: null,
    moneyStatus: null,
    openedAt: new Date("2026-11-17T13:00:00.000Z"),
    ...overrides,
  };
}

describe("claim words", () => {
  it.each([
    ["PNR3430", "O produto não chegou"],
    ["PDD9549", "O produto chegou diferente ou com defeito"],
    ["CS1", "Compra cancelada"],
    ["XYZ1", null],
    [null, null],
  ])("names the reason %s", (reasonId, expected) => {
    expect(claimReason(reasonId)).toBe(expected);
  });

  it("names a return and falls back to a claim for unknown types", () => {
    expect(claimTitle("returns")).toBe("Devolução pedida pelo comprador");
    expect(claimTitle("mediations")).toBe("Reclamação do comprador");
    expect(claimTitle("something_new")).toBe("Reclamação do comprador");
  });
});

describe("claimBadge", () => {
  it("shows an open claim in red with its date", () => {
    expect(claimBadge(claim())).toEqual({ tone: "danger", label: "Aberta em 17/11" });
  });

  it("shows the marketplace's mediation in amber", () => {
    expect(claimBadge(claim({ stage: "dispute" }))).toEqual({
      tone: "warning",
      label: "Em mediação do Mercado Livre",
    });
  });

  it("shows a closed claim in gray with the day it closed", () => {
    const closed = claim({ status: "closed", closedAt: new Date("2026-11-21T12:00:00.000Z") });

    expect(claimBadge(closed)).toEqual({ tone: "muted", label: "Encerrada em 21/11" });
  });
});

describe("claimNextStep", () => {
  it("tells the reseller to answer by the deadline, in Brazil time", () => {
    expect(claimNextStep(claim(), "reseller")).toBe(
      "Responda no Mercado Livre até 19/11. Sem resposta, a venda pode ser perdida.",
    );
  });

  it("tells the reseller nothing is needed while the buyer must act", () => {
    expect(
      claimNextStep(claim({ actionResponsible: "buyer", actionDueAt: null }), "reseller"),
    ).toBe("Aguardando o comprador. Nada a fazer agora.");
  });

  it("tells the supplier the reseller answers", () => {
    expect(claimNextStep(claim(), "supplier")).toBe(
      "O revendedor responde ao comprador pelo Mercado Livre.",
    );
  });

  it("has no next step once the claim closed", () => {
    expect(claimNextStep(claim({ status: "closed" }), "reseller")).toBeNull();
  });
});

describe("claimResolution", () => {
  it("says how a closed claim ended", () => {
    const closed = claim({ status: "closed", resolutionReason: "payment_refunded" });

    expect(claimResolution(closed)).toBe("O dinheiro foi devolvido ao comprador.");
  });

  it("falls back for an ending it does not know", () => {
    const closed = claim({ status: "closed", resolutionReason: "new_reason" });

    expect(claimResolution(closed)).toBe("Encerrada pelo Mercado Livre.");
  });

  it("has nothing to say while the claim is open", () => {
    expect(claimResolution(claim())).toBeNull();
  });
});

describe("claimReturnLines", () => {
  const withReturn = claim({
    returnStatus: "shipped",
    returnTrackingCode: "BR123",
    returnDestination: "seller",
    moneyStatus: "retained",
  });

  it("tells the reseller where the return goes, its tracking and the money", () => {
    expect(claimReturnLines(withReturn, "reseller")).toEqual([
      "Devolução a caminho para o seu endereço.",
      "Rastreio da devolução: BR123",
      "O dinheiro da venda fica retido até a devolução terminar.",
    ]);
  });

  it("keeps the money out of the supplier's lines", () => {
    expect(claimReturnLines(withReturn, "supplier")).toEqual([
      "Devolução a caminho para o endereço do revendedor.",
      "Rastreio da devolução: BR123",
    ]);
  });

  it("has no lines without a return", () => {
    expect(claimReturnLines(claim(), "reseller")).toEqual([]);
  });
});

describe("sortClaims", () => {
  it("puts open claims first, then the most recent", () => {
    const oldOpen = claim({ externalClaimId: "1", openedAt: new Date("2026-11-01T00:00:00Z") });
    const newClosed = claim({ externalClaimId: "2", status: "closed" });
    const newOpen = claim({ externalClaimId: "3", openedAt: new Date("2026-11-18T00:00:00Z") });

    const sorted = sortClaims([oldOpen, newClosed, newOpen]);

    expect(sorted.map((item) => item.externalClaimId)).toEqual(["3", "1", "2"]);
  });
});
