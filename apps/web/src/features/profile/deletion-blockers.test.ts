import type { DeletionBlockers } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { describeDeletionBlockers } from "./deletion-blockers";

const NOW = new Date("2026-11-19T15:00:00Z");
const NO_MONEY = { count: 0, amountCents: 0, lastReleaseAt: null, awaitingDelivery: 0 };
const NOTHING: DeletionBlockers = {
  ordersToShip: 0,
  ordersOnTheWay: 0,
  parcelsToShip: 0,
  parcelsOnTheWay: 0,
  paymentsInProgress: 0,
  sellerMoneyHeld: NO_MONEY,
  supplierMoneyToReceive: NO_MONEY,
  returnsInReview: 0,
};
const SELLER = { slug: "loja-da-ana", kind: "seller" } as const;
const SUPPLIER = { slug: "marca-do-joao", kind: "supplier" } as const;

/** Intl writes a no-break space after the currency sign. */
const brl = (text: string) => text.replace("R$ ", "R$ ");

describe("describeDeletionBlockers", () => {
  it("says nothing when nothing is left to resolve", () => {
    expect(describeDeletionBlockers(NOTHING, { profile: SELLER, now: NOW })).toEqual([]);
  });

  it("counts the seller's orders, with the orders page of that profile", () => {
    const lines = describeDeletionBlockers(
      { ...NOTHING, ordersToShip: 2, ordersOnTheWay: 1 },
      { profile: SELLER, now: NOW },
    );

    expect(lines).toEqual([
      { text: "2 pedidos para enviar", href: "/pedidos?perfil=loja-da-ana" },
      { text: "1 pedido a caminho do comprador", href: "/pedidos?perfil=loja-da-ana" },
    ]);
  });

  it("gives the supplier the amount to receive and the day Asaas frees it", () => {
    const lines = describeDeletionBlockers(
      {
        ...NOTHING,
        parcelsToShip: 1,
        supplierMoneyToReceive: {
          count: 2,
          amountCents: 34_000,
          lastReleaseAt: new Date("2026-11-25T15:00:00Z"),
          awaitingDelivery: 0,
        },
      },
      { profile: SUPPLIER, now: NOW },
    );

    expect(lines.map((line) => line.text)).toEqual([
      "1 pacote para enviar",
      brl("R$ 340,00 a receber (libera até 25 de nov.)"),
    ]);
    expect(lines[1]?.href).toBe("/fornecedor/painel/recebimentos?perfil=marca-do-joao");
  });

  it("says the money frees 7 days after the delivery while a parcel has no date yet", () => {
    const lines = describeDeletionBlockers(
      {
        ...NOTHING,
        sellerMoneyHeld: {
          count: 1,
          amountCents: 5_000,
          lastReleaseAt: new Date("2026-11-25T15:00:00Z"),
          awaitingDelivery: 1,
        },
        returnsInReview: 3,
      },
      { profile: SELLER, now: NOW },
    );

    expect(lines.map((line) => line.text)).toEqual([
      brl("R$ 50,00 pagos a fornecedores e ainda retidos (libera 7 dias depois da entrega)"),
      "3 devoluções em análise",
    ]);
  });

  it("sends a supplier's payments in progress to its money page", () => {
    const [line] = describeDeletionBlockers(
      { ...NOTHING, paymentsInProgress: 1 },
      { profile: SUPPLIER, now: NOW },
    );

    expect(line).toEqual({
      text: "1 pagamento em andamento",
      href: "/fornecedor/painel/recebimentos?perfil=marca-do-joao",
    });
  });
});
