import { describe, expect, it } from "vitest";
import type { CarrierTrackingEvent } from "./carrier-tracking";
import { parcelHistory, parcelProgress, trackingStepsByShipment } from "./parcel-history";

const at = (iso: string) => new Date(iso);

describe("parcelProgress", () => {
  it("marks the steps before the status as done and the status as current", () => {
    expect(parcelProgress("shipped")?.map((step) => step.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
      "todo",
    ]);
  });

  it("puts the delivery problem in place of the last step", () => {
    expect(parcelProgress("not_delivered")?.at(-1)).toEqual({
      label: "Não entregue",
      state: "problem",
    });
    expect(parcelProgress("returned")?.at(-1)?.label).toBe("Devolvido");
  });

  it("shows no steps for a cancelled parcel", () => {
    expect(parcelProgress("cancelled")).toBeNull();
  });
});

describe("parcelHistory", () => {
  it("joins SellBridge's steps and the carrier's scans, newest first", () => {
    const scans: CarrierTrackingEvent[] = [
      {
        at: at("2026-10-27T11:00:00Z"),
        place: "Campinas/SP",
        kind: "in_transit",
        description: "Em trânsito",
      },
      {
        at: at("2026-10-26T21:00:00Z"),
        place: "São Paulo/SP",
        kind: "posted",
        description: "Postado",
      },
    ];
    const history = parcelHistory({
      steps: [
        {
          status: "accepted",
          actor: "Fornecedor",
          note: "",
          createdAt: at("2026-10-25T12:00:00Z"),
        },
        { status: "shipped", actor: "Fornecedor", note: "", createdAt: at("2026-10-26T19:00:00Z") },
      ],
      carrierEvents: scans,
      catalogKind: "supplier",
    });
    expect(history.map((entry) => entry.label)).toEqual([
      "Em trânsito",
      "Postado",
      "Enviado",
      "Aceito",
    ]);
    expect(history[2]?.detail).toBe("por Fornecedor");
  });
});

describe("trackingStepsByShipment", () => {
  it("keeps a code correction as a step and leaves chat messages out", () => {
    const base = { shipmentId: "parcel-1", actor: "Fornecedor" };
    const steps = trackingStepsByShipment([
      { ...base, id: "1", status: "shipped", note: "", createdAt: at("2026-10-26T10:00:00Z") },
      {
        ...base,
        id: "2",
        status: "shipped",
        note: "Código corrigido de QB000000001BR para QB000000002BR",
        createdAt: at("2026-10-26T11:00:00Z"),
      },
      {
        ...base,
        id: "3",
        status: "shipped",
        note: "Saiu hoje cedo",
        createdAt: at("2026-10-26T12:00:00Z"),
      },
    ]);
    expect(steps.get("parcel-1")?.map((step) => step.note)).toEqual([
      "",
      "Código corrigido de QB000000001BR para QB000000002BR",
    ]);
  });
});
