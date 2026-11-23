import { describe, expect, it } from "vitest";
import {
  type NextStepInput,
  type NextStepItem,
  type NextStepShipment,
  orderNextStep,
  payLaterSentence,
  supplierCostCents,
} from "./order-next-step";

const NOW = new Date("2026-11-23T12:00:00Z");

const supplierItem: NextStepItem = {
  catalogKind: "supplier",
  supplierId: "supplier-1",
  supplierName: "BH Beauty",
  quantity: 2,
  unitCostCents: 1058,
};

const parcel: NextStepShipment = {
  id: "shipment-1",
  status: "forwarded",
  catalogKind: "supplier",
  supplierName: "BH Beauty",
  preparationHold: null,
  forwardedAt: new Date("2026-11-23T11:00:00Z"),
  acceptBy: new Date("2026-11-24T11:00:00Z"),
  dispatchBy: null,
};

function input(patch: Partial<NextStepInput>): NextStepInput {
  return {
    orderStatus: "paid",
    items: [supplierItem],
    shipments: [],
    now: NOW,
    ...patch,
  };
}

describe("supplier cost of an order", () => {
  it("adds only the supplier items, times their quantity", () => {
    const own: NextStepItem = { ...supplierItem, catalogKind: "seller", unitCostCents: 999 };
    const unlinked: NextStepItem = { ...supplierItem, supplierId: null, catalogKind: null };

    const total = supplierCostCents([supplierItem, own, unlinked]);

    expect(total).toBe(2116);
  });

  it("says nothing to pay when the supplier cost is zero", () => {
    const free: NextStepItem = { ...supplierItem, unitCostCents: 0 };

    expect(payLaterSentence([free])).toBeNull();
  });

  it("names the amount for one supplier and speaks of suppliers for two", () => {
    const other: NextStepItem = {
      ...supplierItem,
      supplierId: "supplier-2",
      supplierName: "Ateliê",
    };

    expect(payLaterSentence([supplierItem])).toMatch(/^Depois você paga R\$\s21,16 ao fornecedor/);
    expect(payLaterSentence([supplierItem, other])).toContain("aos fornecedores");
  });
});

describe("order next step", () => {
  it("asks to send a paid order with no parcel to the supplier, with what comes after", () => {
    const step = orderNextStep(input({}));

    expect(step.title).toBe("Falta enviar ao fornecedor");
    expect(step.tone).toBe("action");
    expect(step.action).toEqual({ kind: "forward", label: "Enviar ao fornecedor" });
    expect(step.detail).toMatch(/R\$\s21,16/);
  });

  it("asks to prepare the parcel when every item is the reseller's own", () => {
    const own: NextStepItem = { ...supplierItem, catalogKind: "seller" };

    const step = orderNextStep(input({ items: [own] }));

    expect(step.title).toBe("Falta preparar o envio");
    expect(step.action).toEqual({ kind: "forward", label: "Preparar o envio" });
  });

  it("tells the reseller to wait while the buyer has not paid", () => {
    const step = orderNextStep(input({ orderStatus: "pending" }));

    expect(step.title).toBe("Espere o comprador pagar");
    expect(step.detail).toContain("pagamento for confirmado");
    expect(step.action).toBeNull();
  });

  it("says there is nothing to send on a cancelled sale", () => {
    const step = orderNextStep(input({ orderStatus: "cancelled" }));

    expect(step).toMatchObject({ title: "Venda cancelada", action: null, tone: "done" });
  });

  it("shows a forwarded order as sent and waiting for the supplier to accept", () => {
    const step = orderNextStep(input({ shipments: [parcel] }));

    expect(step.title).toMatch(/^Enviado ao fornecedor · /);
    expect(step.detail).toMatch(/^Esperando BH Beauty aceitar até /);
    expect(step.tone).toBe("waiting");
  });

  it("says the reseller does not pay yet while the supplier has no receiving account", () => {
    const held: NextStepShipment = { ...parcel, preparationHold: "receiving_account" };

    const step = orderNextStep(input({ shipments: [held] }));

    expect(step.detail).toMatch(/^Você ainda não precisa pagar/);
    expect(step.action).toBeNull();
  });

  it("puts a payment the supplier waits for before any other parcel", () => {
    const unpaid: NextStepShipment = { ...parcel, id: "shipment-2", preparationHold: "payment" };
    const shipped: NextStepShipment = { ...parcel, status: "shipped" };

    const step = orderNextStep(input({ shipments: [shipped, unpaid] }));

    expect(step.title).toBe("Falta pagar o fornecedor");
    expect(step.action).toEqual({ kind: "pay", shipmentId: "shipment-2" });
  });

  it("follows the parcel furthest behind when there are several", () => {
    const delivered: NextStepShipment = { ...parcel, id: "a", status: "delivered" };
    const picking: NextStepShipment = { ...parcel, id: "b", status: "picking" };

    const step = orderNextStep(input({ orderStatus: "shipped", shipments: [delivered, picking] }));

    expect(step.title).toBe("BH Beauty está preparando");
  });

  it("offers to send again a parcel the supplier cancelled on a paid order", () => {
    const cancelled: NextStepShipment = { ...parcel, status: "cancelled" };

    const step = orderNextStep(input({ shipments: [cancelled] }));

    expect(step.action).toEqual({ kind: "reforward", shipmentId: "shipment-1" });
    expect(step.tone).toBe("problem");
  });

  it("reads a delivered order as done", () => {
    const delivered: NextStepShipment = { ...parcel, status: "delivered" };

    const step = orderNextStep(input({ orderStatus: "delivered", shipments: [delivered] }));

    expect(step).toMatchObject({ title: "Entregue ao comprador", tone: "done", action: null });
  });
});
