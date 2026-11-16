import { describe, expect, test } from "vitest";
import {
  escrowActionFor,
  escrowNeedsAttention,
  escrowReleaseDueAt,
  type EscrowHoldState,
} from "./escrow-release.ts";

const DELIVERED_AT = new Date("2026-12-01T15:00:00Z");
const PAID_AT = new Date("2026-11-25T12:00:00Z");
const EXPIRES_AT = new Date(PAID_AT.getTime() + 30 * 24 * 3600_000);

function heldState(overrides: Partial<EscrowHoldState> = {}): EscrowHoldState {
  return {
    shipmentStatus: "delivered",
    deliveredAt: DELIVERED_AT,
    hasOpenReturnClaim: false,
    cancelledByResellerAfterAccept: false,
    hasChargeback: false,
    teamDecision: null,
    escrow: { status: "active", expiresAt: EXPIRES_AT },
    now: new Date("2026-12-08T15:00:00Z"),
    ...overrides,
  };
}

describe("escrowReleaseDueAt", () => {
  test("is seven days after the confirmed delivery", () => {
    const dueAt = escrowReleaseDueAt(DELIVERED_AT);

    expect(dueAt.toISOString()).toBe("2026-12-08T15:00:00.000Z");
  });
});

describe("escrowActionFor", () => {
  test("releases once seven days have passed since the delivery", () => {
    const action = escrowActionFor(heldState());

    expect(action).toEqual({ kind: "release" });
  });

  test("waits until the seventh day after the delivery", () => {
    const action = escrowActionFor(heldState({ now: new Date("2026-12-08T14:59:59Z") }));

    expect(action).toEqual({
      kind: "wait",
      reason: "release_delay",
      until: new Date("2026-12-08T15:00:00Z"),
    });
  });

  test("waits while the parcel is still on its way", () => {
    const action = escrowActionFor(heldState({ shipmentStatus: "shipped", deliveredAt: null }));

    expect(action).toEqual({ kind: "wait", reason: "not_delivered_yet", until: null });
  });

  test("does not release a delivered parcel without a confirmed delivery date", () => {
    const action = escrowActionFor(heldState({ deliveredAt: null }));

    expect(action).toEqual({ kind: "wait", reason: "not_delivered_yet", until: null });
  });

  test("waits for the guarantee when a card payment is not held yet", () => {
    const action = escrowActionFor(heldState({ escrow: null }));

    expect(action).toEqual({ kind: "wait", reason: "escrow_not_started", until: null });
  });

  test.each(["cancelled", "not_delivered", "returned"] as const)(
    "refunds the reseller when the parcel is %s",
    (shipmentStatus) => {
      const action = escrowActionFor(heldState({ shipmentStatus, deliveredAt: null }));

      expect(action).toEqual({ kind: "refund", reason: shipmentStatus });
    },
  );

  test("pauses for the team when the reseller cancelled after the supplier accepted", () => {
    const action = escrowActionFor(
      heldState({ shipmentStatus: "cancelled", cancelledByResellerAfterAccept: true }),
    );

    expect(action).toEqual({ kind: "paused", reason: "cancelled_after_accept" });
  });

  test("pauses while a return claim is open", () => {
    const action = escrowActionFor(heldState({ hasOpenReturnClaim: true }));

    expect(action).toEqual({ kind: "paused", reason: "return_claim" });
  });

  test("pauses on a card dispute even when the team chose to release", () => {
    const action = escrowActionFor(heldState({ hasChargeback: true, teamDecision: "release" }));

    expect(action).toEqual({ kind: "paused", reason: "chargeback" });
  });

  test("follows the team's refund over an open return claim", () => {
    const action = escrowActionFor(heldState({ hasOpenReturnClaim: true, teamDecision: "refund" }));

    expect(action).toEqual({ kind: "refund", reason: "team" });
  });

  test("follows the team's release before the seventh day", () => {
    const action = escrowActionFor(
      heldState({ teamDecision: "release", now: new Date("2026-12-02T10:00:00Z") }),
    );

    expect(action).toEqual({ kind: "release" });
  });

  test("waits for the guarantee before the team's release", () => {
    const action = escrowActionFor(heldState({ teamDecision: "release", escrow: null }));

    expect(action).toEqual({ kind: "wait", reason: "escrow_not_started", until: null });
  });

  test("does nothing more once the gateway ended the guarantee", () => {
    const action = escrowActionFor(
      heldState({
        shipmentStatus: "cancelled",
        escrow: { status: "done", expiresAt: EXPIRES_AT },
      }),
    );

    expect(action).toEqual({ kind: "finished" });
  });
});

describe("escrowNeedsAttention", () => {
  test("flags a parcel still undelivered five days before the deadline", () => {
    const state = heldState({
      shipmentStatus: "shipped",
      deliveredAt: null,
      now: new Date(EXPIRES_AT.getTime() - 5 * 24 * 3600_000),
    });

    expect(escrowNeedsAttention(state)).toBe(true);
  });

  test("does not flag it six days before the deadline", () => {
    const state = heldState({
      shipmentStatus: "shipped",
      deliveredAt: null,
      now: new Date(EXPIRES_AT.getTime() - 6 * 24 * 3600_000),
    });

    expect(escrowNeedsAttention(state)).toBe(false);
  });

  test("does not flag a parcel that is about to be released", () => {
    const state = heldState({ now: new Date(EXPIRES_AT.getTime() - 24 * 3600_000) });

    expect(escrowNeedsAttention(state)).toBe(false);
  });

  test("does not flag a guarantee the gateway already ended", () => {
    const state = heldState({
      escrow: { status: "done", expiresAt: EXPIRES_AT },
      now: EXPIRES_AT,
    });

    expect(escrowNeedsAttention(state)).toBe(false);
  });
});
