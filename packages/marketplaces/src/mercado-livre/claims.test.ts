import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../http.ts";
import {
  readMercadoLivreClaim,
  readMercadoLivreShipmentOrders,
  searchMercadoLivreClaims,
} from "./claims.ts";
import {
  CLAIM_DETAIL,
  CLAIM_RETURN,
  CLAIM_SELLER_ID,
  CLOSED_CLAIM,
  OPEN_RETURN_CLAIM,
  SHIPMENT_ORDERS,
} from "./fixtures/claims.ts";

const store = { externalShopId: CLAIM_SELLER_ID, accessToken: "test-token" };

function setup(...answers: unknown[]) {
  const request = vi.fn<FetchLike>(async () => Response.json({}));
  for (const answer of answers) {
    request.mockResolvedValueOnce(Response.json(answer));
  }
  const config = {
    clientId: "client",
    clientSecret: "secret",
    fetchImplementation: request,
    retry: { retries: 0 },
  };
  return { request, config };
}

function calledUrl(request: ReturnType<typeof setup>["request"], call: number): string {
  const input = request.mock.calls[call]?.[0];
  return typeof input === "string" ? input : String(input);
}

describe("readMercadoLivreClaim", () => {
  it("reads a closed claim with its detail and no return", async () => {
    const { request, config } = setup(CLOSED_CLAIM, CLAIM_DETAIL);

    const claim = await readMercadoLivreClaim(config, store, "5256749420");

    expect(claim).toEqual({
      externalClaimId: "5256749420",
      status: "closed",
      type: "mediations",
      stage: "claim",
      resource: "order",
      resourceId: "2000007819609432",
      reasonId: "PDD9549",
      openedAt: new Date("2024-03-14T12:28:44.000Z"),
      marketplaceUpdatedAt: new Date("2024-03-21T09:19:22.000Z"),
      resolutionReason: "payment_refunded",
      closedAt: new Date("2024-03-21T09:19:22.000Z"),
      problem: "Nos dijiste que el producto llegó dañado",
      actionResponsible: "mediator",
      actionDueAt: new Date("2023-07-20T02:33:00.000Z"),
      return: null,
    });
    expect(calledUrl(request, 0)).toBe(
      "https://api.mercadolibre.com/post-purchase/v1/claims/5256749420",
    );
    expect(calledUrl(request, 1)).toBe(
      "https://api.mercadolibre.com/post-purchase/v1/claims/5256749420/detail",
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reads the return of a claim that has one", async () => {
    const { request, config } = setup(OPEN_RETURN_CLAIM, CLAIM_DETAIL, CLAIM_RETURN);

    const claim = await readMercadoLivreClaim(config, store, "5256749420");

    expect(claim.return).toEqual({
      status: "delivered",
      moneyStatus: "retained",
      trackingCode: null,
      destination: "marketplace",
    });
    expect(calledUrl(request, 2)).toBe(
      "https://api.mercadolibre.com/post-purchase/v2/claims/5256749420/returns",
    );
  });

  it("refuses a claim answered by another seller", async () => {
    const { config } = setup(CLOSED_CLAIM);

    const read = readMercadoLivreClaim(config, { ...store, externalShopId: "1" }, "5256749420");

    await expect(read).rejects.toThrow(
      "Esta reclamação é de outra conta do Mercado Livre, não desta loja.",
    );
  });

  it("refuses a claim id that is not a number before calling the marketplace", async () => {
    const { request, config } = setup();

    await expect(readMercadoLivreClaim(config, store, "../users/me")).rejects.toThrow(
      "Número da reclamação inválido",
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps an unknown money status and responsible as empty instead of failing", async () => {
    const { config } = setup(
      OPEN_RETURN_CLAIM,
      { ...CLAIM_DETAIL, action_responsible: "robot" },
      { ...CLAIM_RETURN, status_money: "frozen" },
    );

    const claim = await readMercadoLivreClaim(config, store, "5256749420");

    expect(claim.actionResponsible).toBeNull();
    expect(claim.return?.moneyStatus).toBeNull();
  });
});

describe("searchMercadoLivreClaims", () => {
  it("asks for the seller's claims updated after a date, with milliseconds", async () => {
    const { request, config } = setup({
      paging: { total: 2, offset: 0, limit: 100 },
      data: [{ id: 5187110991 }, { id: 5173473377 }],
    });

    const ids = await searchMercadoLivreClaims(config, store, {
      updatedAfter: new Date("2026-11-16T12:00:00.000Z"),
    });

    expect(ids).toEqual(["5187110991", "5173473377"]);
    const url = new URL(calledUrl(request, 0));
    expect(url.pathname).toBe("/post-purchase/v1/claims/search");
    expect(url.searchParams.get("players.user_id")).toBe(CLAIM_SELLER_ID);
    expect(url.searchParams.get("players.role")).toBe("respondent");
    expect(url.searchParams.get("range")).toBe("last_updated:after:2026-11-16T12:00:00.000+00:00");
  });

  it("reads the next page while the first one is full", async () => {
    const fullPage = Array.from({ length: 100 }, (_unused, index) => ({ id: index + 1 }));
    const { request, config } = setup(
      { paging: { total: 101 }, data: fullPage },
      { paging: { total: 101 }, data: [{ id: 101 }] },
    );

    const ids = await searchMercadoLivreClaims(config, store, { status: "opened" });

    expect(ids).toHaveLength(101);
    expect(new URL(calledUrl(request, 1)).searchParams.get("offset")).toBe("100");
  });

  it("asks for the seller's open claims of any age", async () => {
    const { request, config } = setup({ paging: { total: 0 }, data: [] });

    await searchMercadoLivreClaims(config, store, { status: "opened" });

    const url = new URL(calledUrl(request, 0));
    expect(url.searchParams.get("status")).toBe("opened");
    expect(url.searchParams.get("players.role")).toBe("respondent");
    expect(url.searchParams.has("range")).toBe(false);
  });
});

describe("readMercadoLivreShipmentOrders", () => {
  it("lists the store's orders of a shipment with the new-domain header", async () => {
    const { request, config } = setup(SHIPMENT_ORDERS);

    const orders = await readMercadoLivreShipmentOrders(
      config,
      { ...store, externalShopId: "12345" },
      "43810672299",
    );

    expect(orders).toEqual(["2000014428837134", "2000014428837136"]);
    expect(calledUrl(request, 0)).toBe("https://api.mercadolibre.com/shipments/43810672299/orders");
    expect(new Headers(request.mock.calls[0]?.[1]?.headers).get("X-New-Domain")).toBe("true");
  });

  it("answers no orders when the shipment has none (204)", async () => {
    const request = vi.fn<FetchLike>(async () => new Response(null, { status: 204 }));
    const config = { clientId: "c", clientSecret: "s", fetchImplementation: request };

    expect(await readMercadoLivreShipmentOrders(config, store, "1")).toEqual([]);
  });
});

describe("readMercadoLivreClaim dates", () => {
  it("leaves an unreadable deadline empty instead of failing the claim", async () => {
    const { config } = setup(CLOSED_CLAIM, { ...CLAIM_DETAIL, due_date: "amanhã" });

    const claim = await readMercadoLivreClaim(config, store, "5256749420");

    expect(claim.actionDueAt).toBeNull();
  });
});
