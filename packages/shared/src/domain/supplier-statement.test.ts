import { describe, expect, it } from "vitest";
import {
  statementLineOf,
  statementSituationOf,
  statementTotalsOf,
  type StatementPayment,
} from "./supplier-statement.ts";

const PAID_AT = new Date("2026-11-10T15:00:00Z");

function payment(overrides: Partial<StatementPayment> = {}): StatementPayment {
  return {
    provider: "asaas",
    status: "approved",
    amountCents: 10_000,
    platformFeeCents: 400,
    providerFeeCents: 199,
    paymentMethod: "PIX",
    paidAt: PAID_AT,
    refundRequestedAt: null,
    refundFailedAt: null,
    refundHeldAt: null,
    releasedAt: null,
    escrowStatus: "active",
    teamDecision: null,
    teamDecisionAt: null,
    deliveredAt: null,
    ...overrides,
  };
}

describe("statementSituationOf", () => {
  it("waits for the delivery while the parcel is not delivered", () => {
    expect(statementSituationOf(payment())).toEqual({ kind: "waiting_delivery" });
  });

  it("releases the money 7 days after the delivery", () => {
    const deliveredAt = new Date("2026-11-15T13:00:00Z");

    const situation = statementSituationOf(payment({ deliveredAt }));

    expect(situation).toEqual({ kind: "releases_on", on: new Date("2026-11-22T13:00:00Z") });
  });

  it("says when Asaas released the money", () => {
    const releasedAt = new Date("2026-11-23T10:00:00Z");

    const situation = statementSituationOf(payment({ releasedAt, escrowStatus: "done" }));

    expect(situation).toEqual({ kind: "released", on: releasedAt });
  });

  it("counts a guarantee that ended on its own as released, without a day", () => {
    expect(statementSituationOf(payment({ escrowStatus: "done" }))).toEqual({
      kind: "released",
      on: null,
    });
  });

  it("shows a paid parcel the team must look at", () => {
    const situation = statementSituationOf(payment({ refundHeldAt: PAID_AT }));

    expect(situation).toEqual({ kind: "team_review" });
  });

  it("shows money on its way back once the refund was asked", () => {
    const situation = statementSituationOf(payment({ refundRequestedAt: PAID_AT }));

    expect(situation).toEqual({ kind: "returning" });
  });

  it("dates a refunded payment by the day the refund was asked", () => {
    const refundRequestedAt = new Date("2026-11-12T12:00:00Z");

    const situation = statementSituationOf(payment({ status: "refunded", refundRequestedAt }));

    expect(situation).toEqual({ kind: "returned", on: refundRequestedAt });
  });

  it("treats a payment from a provider without guarantee as released when paid", () => {
    const situation = statementSituationOf(
      payment({ provider: "mercado_pago", escrowStatus: null }),
    );

    expect(situation).toEqual({ kind: "released", on: PAID_AT });
  });
});

describe("statementLineOf", () => {
  it("leaves the supplier the price minus SellBridge's share and the real Asaas fee", () => {
    const line = statementLineOf(payment());

    expect(line).toMatchObject({
      soldCents: 10_000,
      platformFeeCents: 400,
      asaasFeeCents: 199,
      asaasFeeEstimated: false,
      netCents: 9401,
    });
  });

  it("estimates the card fee for an older payment with no fee recorded", () => {
    const line = statementLineOf(
      payment({ providerFeeCents: null, paymentMethod: "CREDIT_CARD", amountCents: 5990 }),
    );

    // 2,99% of R$ 59,90 is R$ 1,79, plus R$ 0,49.
    expect(line).toMatchObject({ asaasFeeCents: 228, asaasFeeEstimated: true });
  });

  it("gives the supplier nothing and no fees when the money went back", () => {
    const line = statementLineOf(payment({ status: "refunded" }));

    expect(line).toMatchObject({
      bucket: "returned",
      soldCents: 10_000,
      platformFeeCents: 0,
      asaasFeeCents: null,
      netCents: 0,
    });
  });

  it("never leaves the supplier below zero on a tiny payment", () => {
    const line = statementLineOf(payment({ amountCents: 100, platformFeeCents: 4 }));

    expect(line.netCents).toBe(0);
  });
});

describe("statementTotalsOf", () => {
  it("adds up kept money apart from money that went back", () => {
    const lines = [
      statementLineOf(payment({ releasedAt: PAID_AT, escrowStatus: "done" })),
      statementLineOf(payment({ providerFeeCents: null })),
      statementLineOf(payment({ status: "refunded", amountCents: 3000 })),
    ];

    const totals = statementTotalsOf(lines);

    expect(totals).toEqual({
      soldCents: 20_000,
      platformFeeCents: 800,
      asaasFeeCents: 398,
      netCents: 18_802,
      releasedNetCents: 9401,
      heldNetCents: 9401,
      asaasFeeEstimated: true,
      orders: 2,
      returnedOrders: 1,
      returnedCents: 3000,
    });
  });

  it("gives zero everywhere for a period with no paid order", () => {
    const totals = statementTotalsOf([]);

    expect(totals.netCents).toBe(0);
    expect(totals.orders).toBe(0);
  });
});
