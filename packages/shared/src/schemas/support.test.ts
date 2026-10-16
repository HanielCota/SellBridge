import { describe, expect, it } from "vitest";
import { newTicketSearchSchema, ticketAboutSchema } from "./support.ts";

const ORDER = "8d0c0a52-3b4f-4bb0-9a49-2f1f5d1f7c11";

describe("newTicketSearchSchema", () => {
  it("reads the order, store and listing a ticket is opened from", () => {
    expect(
      newTicketSearchSchema.parse({
        categoria: "order",
        pedido: ORDER,
        loja: ORDER,
        anuncio: ORDER,
      }),
    ).toMatchObject({ categoria: "order", pedido: ORDER, loja: ORDER, anuncio: ORDER });
  });

  it("drops a malformed id instead of breaking the page", () => {
    expect(newTicketSearchSchema.parse({ pedido: "1 or 1=1" }).pedido).toBeUndefined();
  });
});

describe("ticketAboutSchema", () => {
  it("accepts empty fields as nothing linked", () => {
    expect(ticketAboutSchema.parse({ orderId: "", storeConnectionId: "", listingId: "" })).toEqual({
      orderId: undefined,
      storeConnectionId: undefined,
      listingId: undefined,
    });
  });

  it("refuses an id that is not a uuid", () => {
    expect(ticketAboutSchema.safeParse({ orderId: "abc" }).success).toBe(false);
  });
});
