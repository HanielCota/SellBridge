import { describe, expect, it } from "vitest";
import { buildPreferenceRows, hiddenNotificationKinds } from "./notification-preferences";

describe("buildPreferenceRows", () => {
  it("lists every event with the default when nothing was saved", () => {
    const rows = buildPreferenceRows([]);
    const sale = rows.find((row) => row.event === "sale_paid");
    expect(sale).toMatchObject({
      label: "Venda paga",
      channels: {
        in_app: { available: true, enabled: true },
        email: { available: true, enabled: true },
      },
    });
    const delivered = rows.find((row) => row.event === "order_delivered");
    expect(delivered?.channels.in_app.available).toBe(false);
    expect(delivered?.channels.email).toEqual({ available: true, enabled: false });
  });

  it("shows the saved choice over the default", () => {
    const rows = buildPreferenceRows([{ event: "sale_paid", channel: "email", enabled: false }]);
    expect(rows.find((row) => row.event === "sale_paid")?.channels.email.enabled).toBe(false);
  });
});

describe("hiddenNotificationKinds", () => {
  it("hides from the bell the kinds whose in-app notice was turned off", () => {
    const hidden = hiddenNotificationKinds([
      { event: "sale_paid", channel: "in_app", enabled: false },
      { event: "store_expired", channel: "in_app", enabled: true },
      { event: "listing_failed", channel: "email", enabled: false },
    ]);
    expect([...hidden]).toEqual(["sale"]);
  });
});
