import type { TicketThread } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { presentConversation } from "./conversation-thread";

const AT = new Date("2026-10-20T12:00:00Z");

function message(id: string, change: Partial<TicketThread["messages"][number]>) {
  return {
    id,
    body: "Mensagem",
    isAdmin: false,
    isInternal: false,
    authorId: "reseller-user",
    authorName: "Carla Mendes",
    authorImage: "https://cdn.example/carla.png",
    createdAt: AT,
    attachments: [],
    ...change,
  };
}

const THREAD: TicketThread = {
  ticket: {
    id: "ticket-1",
    subject: "O pedido está atrasado",
    status: "answered",
    category: "order",
    priority: "normal",
    awaitingSince: null,
    createdAt: AT,
    updatedAt: AT,
    tenantId: "tenant-1",
    tenantName: "Conta da Carla",
    tenantKind: "seller",
    audience: "supplier",
    supplierId: "supplier-1",
    supplierName: "Calçados Franca",
    supplierTopic: "order",
    storeName: "Loja Centro",
    createdById: "reseller-user",
    createdByName: "Carla Mendes",
    createdByImage: null,
    createdByEmail: "carla@example.com",
    assigneeId: null,
    assigneeName: null,
    firstResponseAt: AT,
    closedAt: null,
    rating: null,
    ratingComment: null,
    ratedAt: null,
  },
  messages: [
    message("m1", {}),
    message("m2", { isAdmin: true, authorId: "supplier-user", authorName: "João do Estoque" }),
    message("m3", { isAdmin: true, isInternal: true, authorName: "Equipe" }),
  ],
  events: [
    {
      id: 1,
      type: "assigned",
      automatic: false,
      actorName: "Ana",
      isSelfAssignment: true,
      fromValue: null,
      toValue: "Ana",
      createdAt: AT,
    },
  ],
  seenByOtherSideAt: null,
};

describe("presentConversation", () => {
  it("shows the supplier the store's name and no photo on the reseller's messages", () => {
    const view = presentConversation(THREAD, [], "supplier");
    expect(view.messages.map((item) => [item.authorName, item.authorImage])).toEqual([
      ["Loja Centro", null],
      ["Calçados Franca", null],
    ]);
    expect(JSON.stringify(view)).not.toContain("carla@example.com");
  });

  it("shows the reseller the brand's name on the supplier's messages", () => {
    const view = presentConversation(THREAD, [], "reseller");
    expect(view.messages.map((item) => item.authorName)).toEqual([
      "Carla Mendes",
      "Calçados Franca",
    ]);
  });

  it("names both people and their side for the team", () => {
    const view = presentConversation(THREAD, [], "team");
    expect(view.messages.map((item) => item.authorName)).toEqual([
      "Carla Mendes · Loja Centro",
      "João do Estoque · Calçados Franca",
    ]);
  });

  it("drops internal notes and every history line but status changes", () => {
    const view = presentConversation(THREAD, [], "reseller");
    expect(view.messages.map((item) => item.id)).toEqual(["m1", "m2"]);
    expect(view.events).toEqual([]);
  });

  it("keeps only the order number of a linked order", () => {
    const orders = [{ orderId: "order-1", externalOrderId: "MLB-123", buyerName: "Comprador" }];
    expect(presentConversation(THREAD, orders, "supplier").orders).toEqual([
      { orderId: "order-1", externalOrderId: "MLB-123" },
    ]);
  });
});
