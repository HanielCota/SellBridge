import { describe, expect, it } from "vitest";
import { orderSteps } from "./order-steps";

const forwardedAt = new Date("2026-11-10T12:00:00Z");
const acceptedAt = new Date("2026-11-10T13:00:00Z");
const printedAt = new Date("2026-11-10T14:00:00Z");
const readyAt = new Date("2026-11-10T15:00:00Z");

describe("orderSteps", () => {
  it("gives each step done its time and leaves the rest without one", () => {
    const steps = orderSteps({
      events: [
        { status: "forwarded", createdAt: forwardedAt },
        { status: "accepted", createdAt: acceptedAt },
        { status: "picking", createdAt: acceptedAt },
        { status: "ready", createdAt: readyAt },
      ],
      labelPrintedAt: printedAt,
      hasMarketplaceLabel: true,
    });

    expect(steps).toEqual([
      { key: "received", label: "Recebido", at: forwardedAt },
      { key: "accepted", label: "Aceito", at: acceptedAt },
      { key: "label", label: "Etiqueta impressa", at: printedAt },
      { key: "picked", label: "Separado", at: readyAt },
      { key: "shipped", label: "Enviado", at: null },
    ]);
  });

  it("puts the note right after the parcel arrives, waiting until it is issued", () => {
    const authorizedAt = new Date("2026-11-10T12:10:00Z");

    const waiting = orderSteps({
      events: [{ status: "forwarded", createdAt: forwardedAt }],
      labelPrintedAt: null,
      hasMarketplaceLabel: true,
      invoice: { authorizedAt: null },
    });
    const issued = orderSteps({
      events: [{ status: "forwarded", createdAt: forwardedAt }],
      labelPrintedAt: null,
      hasMarketplaceLabel: true,
      invoice: { authorizedAt },
    });

    expect(waiting.map((step) => step.key)).toEqual([
      "received",
      "invoice",
      "accepted",
      "label",
      "picked",
      "shipped",
    ]);
    expect(waiting[1]).toEqual({ key: "invoice", label: "Nota emitida", at: null });
    expect(issued[1]?.at).toEqual(authorizedAt);
  });

  it("leaves the label step out on a channel without a marketplace label", () => {
    const steps = orderSteps({ events: [], labelPrintedAt: null, hasMarketplaceLabel: false });

    expect(steps.map((step) => step.key)).toEqual(["received", "accepted", "picked", "shipped"]);
  });

  it("shows the latest forward of a parcel forwarded twice", () => {
    const again = new Date("2026-11-11T09:00:00Z");

    const steps = orderSteps({
      events: [
        { status: "forwarded", createdAt: forwardedAt },
        { status: "forwarded", createdAt: again },
      ],
      labelPrintedAt: null,
      hasMarketplaceLabel: false,
    });

    expect(steps[0]?.at).toEqual(again);
  });
});
