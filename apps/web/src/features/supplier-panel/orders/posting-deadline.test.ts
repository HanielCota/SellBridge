import { describe, expect, it } from "vitest";
import { type PostingDeadlineParcel, postingDeadline } from "./posting-deadline";

/** Mercado Livre's SLA for 14 Nov: until 23:59:59 in Brazil time. */
const NOVEMBER_14 = new Date("2026-11-14T23:59:59-03:00");

function parcel(overrides: Partial<PostingDeadlineParcel> = {}): PostingDeadlineParcel {
  return {
    marketplace: "mercado_livre",
    status: "accepted",
    orderStatus: "paid",
    dispatchDeadlineAt: NOVEMBER_14,
    ...overrides,
  };
}

describe("postingDeadline", () => {
  it("dates the posting when the day is still ahead", () => {
    const now = new Date("2026-11-12T10:00:00-03:00");

    const deadline = postingDeadline(parcel(), now);

    expect(deadline).toEqual({ state: "on_time", label: "Postar no Mercado Livre até 14 de nov." });
  });

  it("says tomorrow by name", () => {
    const now = new Date("2026-11-13T20:00:00-03:00");

    expect(postingDeadline(parcel(), now)?.label).toBe("Postar no Mercado Livre até amanhã");
  });

  it("warns on the posting day itself", () => {
    const now = new Date("2026-11-14T08:00:00-03:00");

    expect(postingDeadline(parcel(), now)).toEqual({
      state: "today",
      label: "Postar no Mercado Livre hoje",
    });
  });

  it("turns late once the posting day is over, with the date that was missed", () => {
    const now = new Date("2026-11-16T09:00:00-03:00");

    expect(postingDeadline(parcel(), now)).toEqual({
      state: "late",
      label: "Postagem atrasada (prazo: 14 de nov.)",
    });
  });

  it("keeps a midnight-dated deadline on time for its whole day", () => {
    const midnight = new Date("2026-11-14T00:00:00-03:00");
    const now = new Date("2026-11-14T22:00:00-03:00");

    expect(postingDeadline(parcel({ dispatchDeadlineAt: midnight }), now)?.state).toBe("today");
  });

  it.each([
    { dispatchDeadlineAt: null },
    { marketplace: "shopee" },
    { status: "shipped" as const },
    { orderStatus: "cancelled" },
  ])("shows no posting date for %j", (overrides) => {
    const now = new Date("2026-11-12T10:00:00-03:00");

    expect(postingDeadline(parcel(overrides), now)).toBeNull();
  });
});
