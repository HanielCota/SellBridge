import { BILLING_PLANS } from "@sellbridge/shared/billing";
import { describe, expect, it } from "vitest";
import { listingsShortBy, planRoomOf } from "./plan-room";

const START = BILLING_PLANS[0];

describe("planRoomOf", () => {
  it("leaves the plan's room after what the account already uses", () => {
    const room = planRoomOf(
      { kind: "plan", plan: START, source: "subscription" },
      { stores: 1, listings: 120 },
    );

    expect(room).toEqual({
      kind: "plan",
      planId: "start",
      planName: "Start",
      allowed: { stores: 3, listings: 300 },
      used: { stores: 1, listings: 120 },
      left: { stores: 2, listings: 180 },
    });
  });

  it("never leaves a negative room for an account over its plan", () => {
    const room = planRoomOf(
      { kind: "plan", plan: START, source: "subscription" },
      { stores: 5, listings: 400 },
    );

    expect(room.kind === "plan" ? room.left : null).toEqual({ stores: 0, listings: 0 });
  });

  it("is unlimited while billing is off", () => {
    expect(planRoomOf(null, { stores: 2, listings: 9 }).kind).toBe("unlimited");
  });

  it("is unlimited during the launch transition", () => {
    const access = { kind: "transition", until: new Date("2026-12-31T00:00:00Z") } as const;

    expect(planRoomOf(access, { stores: 0, listings: 0 }).kind).toBe("unlimited");
  });

  it("leaves no room without a plan", () => {
    const room = planRoomOf({ kind: "none" }, { stores: 0, listings: 0 });

    expect(room).toMatchObject({ kind: "no_plan", left: { stores: 0, listings: 0 } });
  });
});

describe("listingsShortBy", () => {
  const room = planRoomOf(
    { kind: "plan", plan: START, source: "subscription" },
    { stores: 1, listings: 296 },
  );

  it("is zero when the batch fits exactly", () => {
    expect(listingsShortBy(room, 4)).toBe(0);
  });

  it("counts the listings beyond the plan", () => {
    expect(listingsShortBy(room, 10)).toBe(6);
  });

  it("is zero with no limit", () => {
    expect(listingsShortBy(planRoomOf(null, { stores: 0, listings: 0 }), 999)).toBe(0);
  });
});
