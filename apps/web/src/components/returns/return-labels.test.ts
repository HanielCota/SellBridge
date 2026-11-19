import type { ReturnPolicyDetails } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { deadlineText, returnStepBadge } from "./return-labels";

const MONDAY_NOON = new Date("2026-11-16T12:00:00-03:00");

function policy(overrides: Partial<ReturnPolicyDetails>): ReturnPolicyDetails {
  return {
    step: "awaiting_supplier",
    destination: "supplier",
    reason: null,
    reasonNote: null,
    returnShippingCents: null,
    reasonStatedAt: null,
    arrivedAt: MONDAY_NOON,
    forwardDueAt: null,
    forwardedAt: null,
    forwardTrackingCode: null,
    supplierReceivedAt: null,
    marketplaceDueAt: null,
    supplierDueAt: null,
    supplierVerdict: null,
    supplierCondition: null,
    supplierResellable: null,
    supplierAnsweredAt: null,
    closeReason: null,
    closedAt: null,
    supplierOwesShippingCents: null,
    stockReturnedAt: null,
    photos: [],
    ...overrides,
  };
}

describe("deadlineText", () => {
  it("names the last day for a deadline at Brasília midnight", () => {
    const endOfThursday = new Date("2026-11-20T03:00:00.000Z");

    expect(deadlineText(endOfThursday, MONDAY_NOON)).toBe("até o fim de 19 de nov.");
  });

  it("keeps the time of an exact deadline", () => {
    const tomorrowAfternoon = new Date("2026-11-17T15:30:00-03:00");

    expect(deadlineText(tomorrowAfternoon, MONDAY_NOON)).toBe("até amanhã às 15:30");
  });
});

describe("returnStepBadge", () => {
  it("shows the supplier's deadline while it checks the product", () => {
    const badge = returnStepBadge(
      policy({ supplierDueAt: new Date("2026-11-17T03:00:00.000Z") }),
      MONDAY_NOON,
    );

    expect(badge).toEqual({ tone: "warning", label: "Fornecedor conferindo · até o fim de hoje" });
  });

  it("asks the reseller to send the parcel on, with its deadline", () => {
    const badge = returnStepBadge(
      policy({ step: "awaiting_forward", forwardDueAt: new Date("2026-11-23T12:00:00-03:00") }),
      MONDAY_NOON,
    );

    expect(badge.label).toBe("Reenviar ao fornecedor · até 23 de nov. às 12:00");
  });

  it("marks a closed return in green with its date", () => {
    const badge = returnStepBadge(policy({ step: "closed", closedAt: MONDAY_NOON }), MONDAY_NOON);

    expect(badge).toEqual({ tone: "success", label: "Encerrada · agora" });
  });
});
