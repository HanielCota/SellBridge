import { describe, expect, it } from "vitest";
import type { FulfillmentStatus } from "../schemas/fulfillment.ts";
import {
  compareQueueUrgency,
  countdownLabel,
  describeQueueEntry,
  isSupplierQueueStatus,
  nextSupplierAction,
  queueDeadline,
  sortQueueByUrgency,
  urgencyFor,
} from "./supplier-panel-orders.ts";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const forwardedAt = new Date("2026-10-16T12:00:00.000Z");

function timing(status: FulfillmentStatus, overrides: { dispatchDeadlineAt?: Date | null } = {}) {
  return {
    status,
    forwardedAt,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
    dispatchDeadlineAt: overrides.dispatchDeadlineAt ?? null,
    estimatedDeliveryAt: null,
  };
}

describe("nextSupplierAction", () => {
  it("offers one step per queue status, following FULFILLMENT_NEXT", () => {
    expect(nextSupplierAction("forwarded")).toEqual({
      status: "accepted",
      label: "Aceitar pedido",
      needsTracking: false,
    });
    expect(nextSupplierAction("accepted")?.status).toBe("picking");
    expect(nextSupplierAction("picking")?.status).toBe("ready");
    expect(nextSupplierAction("ready")).toEqual({
      status: "shipped",
      label: "Enviar com rastreio",
      needsTracking: true,
    });
  });

  it("offers nothing once the parcel left the supplier", () => {
    for (const status of ["shipped", "delivered", "cancelled", "returned"] as const) {
      expect(nextSupplierAction(status)).toBeNull();
    }
  });
});

describe("isSupplierQueueStatus", () => {
  it("keeps only the statuses still in the supplier's hands", () => {
    expect(isSupplierQueueStatus("picking")).toBe(true);
    expect(isSupplierQueueStatus("shipped")).toBe(false);
  });
});

describe("queueDeadline", () => {
  it("counts the accept hours from the forward while waiting for the accept", () => {
    expect(queueDeadline(timing("forwarded"))).toEqual({
      kind: "accept",
      at: new Date(forwardedAt.getTime() + 24 * HOUR),
    });
  });

  it("counts the dispatch hours once accepted", () => {
    expect(queueDeadline(timing("accepted"))).toEqual({
      kind: "dispatch",
      at: new Date(forwardedAt.getTime() + 48 * HOUR),
    });
  });

  it("uses the end of the marketplace's dispatch day, as shipmentDelay does", () => {
    const dispatchDeadlineAt = new Date("2026-10-17T03:00:00.000Z");
    expect(queueDeadline(timing("ready", { dispatchDeadlineAt }))).toEqual({
      kind: "dispatch",
      at: new Date("2026-10-18T03:00:00.000Z"),
    });
  });

  it("takes the earlier of accept and dispatch on a forwarded parcel", () => {
    const dispatchDeadlineAt = new Date("2026-10-16T03:00:00.000Z");
    expect(queueDeadline(timing("forwarded", { dispatchDeadlineAt }))?.kind).toBe("dispatch");
  });

  it("has no deadline outside the queue or without a forward", () => {
    expect(queueDeadline(timing("shipped"))).toBeNull();
    expect(queueDeadline({ ...timing("accepted"), forwardedAt: null })).toBeNull();
  });
});

describe("urgencyFor", () => {
  it("reads overdue at zero, danger under 2 h, warning under 12 h", () => {
    expect(urgencyFor(0)).toBe("overdue");
    expect(urgencyFor(-MINUTE)).toBe("overdue");
    expect(urgencyFor(2 * HOUR - 1)).toBe("danger");
    expect(urgencyFor(2 * HOUR)).toBe("warning");
    expect(urgencyFor(12 * HOUR - 1)).toBe("warning");
    expect(urgencyFor(12 * HOUR)).toBe("normal");
  });

  it("is never urgent without a deadline", () => {
    expect(urgencyFor(null)).toBe("normal");
  });
});

describe("describeQueueEntry", () => {
  it("puts the action, the time left and the tone together", () => {
    const now = new Date(forwardedAt.getTime() + 23 * HOUR);
    const entry = describeQueueEntry(timing("forwarded"), now);
    expect(entry.action?.status).toBe("accepted");
    expect(entry.remainingMilliseconds).toBe(HOUR);
    expect(entry.urgency).toBe("danger");
  });

  it("leaves a shipped parcel without action nor countdown", () => {
    expect(describeQueueEntry(timing("shipped"), forwardedAt)).toEqual({
      action: null,
      deadline: null,
      remainingMilliseconds: null,
      urgency: "normal",
    });
  });
});

const at = (hours: number) => ({ kind: "dispatch" as const, at: new Date(hours * HOUR) });

describe("compareQueueUrgency", () => {
  it("puts the most overdue first and parcels without a deadline last", () => {
    const sorted = sortQueueByUrgency([
      { id: "c", deadline: null, forwardedAt },
      { id: "b", deadline: at(10), forwardedAt },
      { id: "a", deadline: at(1), forwardedAt },
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties by the oldest forward, then by id", () => {
    const older = new Date(forwardedAt.getTime() - HOUR);
    expect(
      compareQueueUrgency(
        { id: "z", deadline: at(1), forwardedAt: older },
        { id: "a", deadline: at(1), forwardedAt },
      ),
    ).toBeLessThan(0);
    expect(
      compareQueueUrgency(
        { id: "a", deadline: null, forwardedAt: null },
        { id: "b", deadline: null, forwardedAt: null },
      ),
    ).toBeLessThan(0);
  });
});

describe("countdownLabel", () => {
  const accept = { kind: "accept" as const, at: forwardedAt };

  it("says the time left in minutes, hours and days", () => {
    expect(countdownLabel({ deadline: accept, remainingMilliseconds: 40 * MINUTE })).toBe(
      "Aceite em 40 min",
    );
    expect(countdownLabel({ deadline: accept, remainingMilliseconds: 3 * HOUR })).toBe(
      "Aceite em 3 h",
    );
    expect(countdownLabel({ deadline: accept, remainingMilliseconds: 80 * MINUTE })).toBe(
      "Aceite em 1 h 20 min",
    );
    expect(countdownLabel({ deadline: accept, remainingMilliseconds: 48 * HOUR })).toBe(
      "Aceite em 2 d",
    );
    expect(countdownLabel({ deadline: accept, remainingMilliseconds: 50 * HOUR })).toBe(
      "Aceite em 2 d 2 h",
    );
  });

  it("says how late an overdue deadline is", () => {
    const dispatch = { kind: "dispatch" as const, at: forwardedAt };
    expect(countdownLabel({ deadline: dispatch, remainingMilliseconds: -3 * HOUR })).toBe(
      "Despacho atrasado há 3 h",
    );
    expect(countdownLabel({ deadline: dispatch, remainingMilliseconds: 0 })).toBe(
      "Despacho atrasado há 1 min",
    );
  });

  it("says there is no deadline when none applies", () => {
    expect(countdownLabel({ deadline: null, remainingMilliseconds: null })).toBe("Sem prazo");
  });
});
