import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../http.ts";
import { readMercadoLivreSalePayments } from "./sale-payments.ts";

const store = { externalShopId: "99", accessToken: "test-token" };

function setup(order: unknown) {
  const request = vi.fn<FetchLike>().mockResolvedValueOnce(Response.json(order));
  return {
    request,
    config: {
      clientId: "client",
      clientSecret: "secret",
      fetchImplementation: request,
      retry: { retries: 0 },
    },
  };
}

describe("readMercadoLivreSalePayments", () => {
  it("reads the buyer's nickname and the approved payments with their authorization code", async () => {
    const { config } = setup({
      seller: { id: 99 },
      buyer: { nickname: "JULIANA.COSTA" },
      payments: [
        {
          status: "approved",
          payment_type: "credit_card",
          payment_method_id: "master",
          authorization_code: "008877",
          transaction_amount: 99.9,
        },
        {
          status: "rejected",
          payment_type: "credit_card",
          payment_method_id: "visa",
          authorization_code: null,
          transaction_amount: 99.9,
        },
      ],
    });

    const read = await readMercadoLivreSalePayments(config, store, "55");

    expect(read).toEqual({
      buyerNickname: "JULIANA.COSTA",
      payments: [
        { type: "credit_card", methodId: "master", authorizationCode: "008877", amountCents: 9990 },
      ],
    });
  });

  it("keeps a Pix payment without an authorization code", async () => {
    const { config } = setup({
      seller: { id: 99 },
      buyer: { nickname: "ANA" },
      payments: [
        {
          status: "approved",
          payment_type: "bank_transfer",
          payment_method_id: "pix",
          transaction_amount: 50,
        },
      ],
    });

    const read = await readMercadoLivreSalePayments(config, store, "55");

    expect(read.payments).toEqual([
      { type: "bank_transfer", methodId: "pix", authorizationCode: null, amountCents: 5000 },
    ]);
  });

  it("refuses an order of another seller", async () => {
    const { config } = setup({ seller: { id: 12 }, payments: [] });

    await expect(readMercadoLivreSalePayments(config, store, "55")).rejects.toThrow(
      "Pedido não pertence à loja conectada",
    );
  });

  it("refuses an order number that is not numeric", async () => {
    const { config, request } = setup({});

    await expect(readMercadoLivreSalePayments(config, store, "55/x")).rejects.toThrow(
      "Número de pedido inválido",
    );
    expect(request).not.toHaveBeenCalled();
  });
});
