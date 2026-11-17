import { describe, expect, it, vi } from "vitest";
import { runPaymentRounds } from "./payment-rounds.ts";

describe("runPaymentRounds", () => {
  it("still runs the Asaas round when the Mercado Pago round fails", async () => {
    const failure = new Error("Mercado Pago round failed");
    const mercadoPago = vi.fn<() => Promise<void>>().mockRejectedValue(failure);
    const asaas = vi.fn<() => Promise<void>>().mockResolvedValue();

    const run = runPaymentRounds([mercadoPago, asaas]);

    await expect(run).rejects.toBe(failure);
    expect(asaas).toHaveBeenCalledOnce();
  });

  it("runs every round in order when none fails", async () => {
    const order: string[] = [];

    await runPaymentRounds([
      async () => {
        order.push("mercado_pago");
      },
      async () => {
        order.push("asaas");
      },
    ]);

    expect(order).toEqual(["mercado_pago", "asaas"]);
  });
});
