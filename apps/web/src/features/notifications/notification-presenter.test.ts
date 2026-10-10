import { describe, expect, it } from "vitest";
import { presentNotification, presentNotificationFeed } from "./notification-presenter";

const at = new Date(Date.UTC(2026, 9, 9, 12));

describe("presentNotification", () => {
  it("shows a sale with its total and leads to the order in the financial report", () => {
    const notification = presentNotification({
      kind: "sale",
      entityId: "order-1",
      at,
      externalOrderId: "MOCK ORD/1",
      totalCents: 4990,
      storeName: "Ana Moda (loja simulada)",
    });
    expect(notification).toMatchObject({ id: "sale:order-1", kind: "sale", at });
    // Currency formatting puts a no-break space after "R$".
    expect(notification.title).toMatch(/^Nova venda de R\$\s49,90$/);
    expect(notification.detail).toBe("MOCK ORD/1 · Ana Moda");
    expect(notification.href).toBe("/financeiro?query=MOCK%20ORD%2F1");
  });

  it("explains a refused publication, falling back when there is no reason", () => {
    const notification = presentNotification({
      kind: "listing_error",
      entityId: "target-1",
      at,
      listingTitle: "Vestido floral",
      errorReason: null,
    });
    expect(notification).toEqual({
      id: `listing:target-1:${at.getTime()}`,
      kind: "listing_error",
      title: "Publicação recusada: Vestido floral",
      detail: "Erro ao publicar",
      at,
      href: "/publicacoes?status=error",
    });
  });

  it("asks to reconnect a store without the simulated suffix", () => {
    const notification = presentNotification({
      kind: "store_problem",
      entityId: "store-1",
      at,
      storeName: "Ana Casa (loja simulada)",
    });
    expect(notification).toMatchObject({
      id: `store:store-1:${at.getTime()}`,
      title: "Ana Casa precisa ser reconectada",
      detail: "Pedidos e estoque estão parados nesta loja.",
      href: "/lojas",
    });
  });

  it("leads a support reply to its ticket", () => {
    const notification = presentNotification({
      kind: "support_reply",
      entityId: "ticket-1",
      at,
      subject: "Dúvida de frete",
    });
    expect(notification).toMatchObject({
      id: `ticket:ticket-1:${at.getTime()}`,
      title: "O suporte respondeu",
      detail: "Dúvida de frete",
      href: "/suporte/ticket-1",
    });
  });
});

describe("presentNotificationFeed", () => {
  it("keeps the unread count and the last time the user looked", () => {
    const presented = presentNotificationFeed({
      events: [{ kind: "support_reply", entityId: "ticket-1", at, subject: "Oi" }],
      unread: 1,
      seenAt: null,
    });
    expect(presented.items.map((item) => item.id)).toEqual([`ticket:ticket-1:${at.getTime()}`]);
    expect(presented).toMatchObject({ unread: 1, seenAt: null });
  });
});
