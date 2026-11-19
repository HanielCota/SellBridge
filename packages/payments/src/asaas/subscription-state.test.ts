import { describe, expect, test } from "vitest";
import {
  nextMonthlyDueDate,
  previousMonthlyDueDate,
  refundableFirstFee,
  startOfDueDate,
  subscriptionBillingState,
} from "./subscription-state.ts";
import type { AsaasSubscription, AsaasSubscriptionCharge } from "./subscriptions.ts";

const GRACE_DAYS = 7;

function subscription(overrides: Partial<AsaasSubscription> = {}): AsaasSubscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "ACTIVE",
    deleted: false,
    value: 197,
    nextDueDate: "2026-12-19",
    billingType: "PIX",
    ...overrides,
  };
}

function charge(dueDate: string, status: string, id = `pay_${dueDate}`): AsaasSubscriptionCharge {
  return {
    id,
    subscription: "sub_1",
    status,
    value: 197,
    dueDate,
    invoiceUrl: "https://asaas.test/i/1",
  };
}

describe("due dates", () => {
  test("starts a due date at midnight in Brasília", () => {
    expect(startOfDueDate("2026-11-19").toISOString()).toBe("2026-11-19T03:00:00.000Z");
  });

  test("moves a due date to the same day next month", () => {
    expect(nextMonthlyDueDate("2026-11-19")).toBe("2026-12-19");
  });

  test("moves December to January of the next year", () => {
    expect(nextMonthlyDueDate("2026-12-05")).toBe("2027-01-05");
  });

  test("falls back to the last day of a shorter month", () => {
    expect(nextMonthlyDueDate("2027-01-31")).toBe("2027-02-28");
  });

  test("moves a due date to the same day last month", () => {
    expect(previousMonthlyDueDate("2027-01-05")).toBe("2026-12-05");
    expect(previousMonthlyDueDate("2027-03-31")).toBe("2027-02-28");
  });

  test("throws RangeError for a date Asaas would never send", () => {
    expect(() => startOfDueDate("19/11/2026")).toThrow(RangeError);
  });
});

describe("subscription billing state", () => {
  test("waits for the first payment before granting anything", () => {
    const state = subscriptionBillingState({
      subscription: subscription(),
      charges: [charge("2026-11-19", "PENDING")],
      graceDays: GRACE_DAYS,
      prepaidUntil: null,
    });

    expect(state).toMatchObject({ status: "incomplete", periodEnd: null, paidPeriod: null });
    expect(state.openCharge?.id).toBe("pay_2026-11-19");
  });

  test("keeps the plan until the day after the next due date once paid", () => {
    const state = subscriptionBillingState({
      subscription: subscription(),
      charges: [charge("2026-12-19", "PENDING"), charge("2026-11-19", "RECEIVED")],
      graceDays: GRACE_DAYS,
      prepaidUntil: null,
    });

    expect(state.status).toBe("active");
    expect(state.periodEnd?.toISOString()).toBe("2026-12-20T03:00:00.000Z");
    expect(state.paidPeriod?.start.toISOString()).toBe("2026-11-19T03:00:00.000Z");
    expect(state.paidPeriod?.end.toISOString()).toBe("2026-12-19T03:00:00.000Z");
    expect(state.openCharge?.id).toBe("pay_2026-12-19");
  });

  test("counts a card payment still settling as paid", () => {
    const state = subscriptionBillingState({
      subscription: subscription({ billingType: "CREDIT_CARD" }),
      charges: [charge("2026-11-19", "CONFIRMED")],
      graceDays: GRACE_DAYS,
      prepaidUntil: null,
    });

    expect(state.status).toBe("active");
  });

  test("gives a late charge the grace from its due date", () => {
    const state = subscriptionBillingState({
      subscription: subscription(),
      charges: [charge("2026-12-19", "OVERDUE"), charge("2026-11-19", "RECEIVED")],
      graceDays: GRACE_DAYS,
      prepaidUntil: null,
    });

    expect(state.status).toBe("past_due");
    expect(state.periodEnd?.toISOString()).toBe("2026-12-26T03:00:00.000Z");
    expect(state.openCharge?.status).toBe("OVERDUE");
  });

  test("never cuts the paid month short when the grace is zero", () => {
    const state = subscriptionBillingState({
      subscription: subscription(),
      charges: [charge("2026-12-19", "OVERDUE"), charge("2026-11-19", "RECEIVED")],
      graceDays: 0,
      prepaidUntil: null,
    });

    expect(state.periodEnd?.toISOString()).toBe("2026-12-20T03:00:00.000Z");
  });

  test("lets the paid month run out after the subscription is ended", () => {
    const state = subscriptionBillingState({
      subscription: subscription({ status: "INACTIVE", deleted: true }),
      charges: [charge("2026-11-19", "RECEIVED")],
      graceDays: GRACE_DAYS,
      prepaidUntil: null,
    });

    expect(state).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    expect(state.periodEnd?.toISOString()).toBe("2026-12-20T03:00:00.000Z");
  });

  test("marks an ended subscription that was never paid as canceled", () => {
    const state = subscriptionBillingState({
      subscription: subscription({ status: "INACTIVE", deleted: true }),
      charges: [],
      graceDays: GRACE_DAYS,
      prepaidUntil: null,
    });

    expect(state).toMatchObject({ status: "canceled", periodEnd: null, cancelAtPeriodEnd: true });
  });

  test("does not count a refunded charge as paid", () => {
    const state = subscriptionBillingState({
      subscription: subscription(),
      charges: [charge("2026-11-19", "REFUNDED")],
      graceDays: GRACE_DAYS,
      prepaidUntil: null,
    });

    expect(state.status).toBe("incomplete");
  });

  test("ignores a late charge older than the last payment", () => {
    const state = subscriptionBillingState({
      subscription: subscription(),
      charges: [charge("2026-11-19", "RECEIVED"), charge("2026-10-19", "OVERDUE")],
      graceDays: GRACE_DAYS,
      prepaidUntil: null,
    });

    expect(state.status).toBe("active");
    expect(state.openCharge).toBeNull();
  });

  test("keeps a month an earlier subscription paid until the new one charges", () => {
    const state = subscriptionBillingState({
      subscription: subscription(),
      charges: [charge("2026-12-19", "PENDING")],
      graceDays: GRACE_DAYS,
      prepaidUntil: new Date("2026-12-20T03:00:00Z"),
    });

    expect(state.status).toBe("active");
    expect(state.periodEnd?.toISOString()).toBe("2026-12-20T03:00:00.000Z");
    expect(state.paidPeriod?.start.toISOString()).toBe("2026-11-19T03:00:00.000Z");
    expect(state.paidPeriod?.end.toISOString()).toBe("2026-12-19T03:00:00.000Z");
  });

  test("gives the first charge after a prepaid month the usual grace", () => {
    const state = subscriptionBillingState({
      subscription: subscription(),
      charges: [charge("2026-12-19", "OVERDUE")],
      graceDays: GRACE_DAYS,
      prepaidUntil: new Date("2026-12-20T03:00:00Z"),
    });

    expect(state.status).toBe("past_due");
    expect(state.periodEnd?.toISOString()).toBe("2026-12-26T03:00:00.000Z");
  });
});

describe("first monthly fee refund", () => {
  const first = { ...charge("2026-11-19", "RECEIVED", "pay_first"), paymentDate: "2026-11-19" };

  test("gives the first fee back on the seventh day after it was paid", () => {
    const refundable = refundableFirstFee({
      charges: [first],
      firstPaidOn: "2026-11-19",
      today: "2026-11-26",
    });

    expect(refundable?.id).toBe("pay_first");
  });

  test("keeps the first fee from the eighth day on", () => {
    const refundable = refundableFirstFee({
      charges: [first],
      firstPaidOn: "2026-11-19",
      today: "2026-11-27",
    });

    expect(refundable).toBeNull();
  });

  test("never gives back a fee after the first", () => {
    const second = { ...charge("2026-12-19", "RECEIVED", "pay_second"), paymentDate: "2026-12-19" };

    const refundable = refundableFirstFee({
      charges: [second, first],
      firstPaidOn: "2026-11-19",
      today: "2026-12-20",
    });

    expect(refundable).toBeNull();
  });

  test("never counts a new subscription's fee as the account's first", () => {
    const again = { ...charge("2027-03-02", "RECEIVED", "pay_again"), paymentDate: "2027-03-02" };

    const refundable = refundableFirstFee({
      charges: [again],
      firstPaidOn: "2026-11-19",
      today: "2027-03-03",
    });

    expect(refundable).toBeNull();
  });
});
