import { describe, expect, it } from "vitest";
import { presentNotification, presentNotificationFeed } from "./notification-presenter";

const at = new Date(Date.UTC(2026, 9, 9, 12));

describe("presentNotification", () => {
  it("tells the reseller which listing was paused, why, and where to see it", () => {
    const notification = presentNotification({
      kind: "listing_unavailable",
      entityId: "listing-4",
      at,
      listingTitle: "Moletom canguru - Rosa",
      reason: "product_inactive",
    });
    expect(notification).toMatchObject({
      id: "unavailable:listing-4",
      kind: "listing_unavailable",
    });
    expect(notification.title).toBe("Anúncio pausado: Moletom canguru - Rosa");
    expect(notification.detail).toBe(
      "O fornecedor tirou este produto do catálogo. O anúncio fica pausado; reative quando ele voltar.",
    );
    expect(notification.href).toBe("/publicacoes?query=Moletom%20canguru%20-%20Rosa");
  });

  it("tells the reseller which order is short and what to do about it", () => {
    const notification = presentNotification({
      kind: "stock_shortage",
      entityId: "order-9",
      at,
      externalOrderId: "ML-9",
      productTitle: "Moletom canguru - Rosa",
    });
    expect(notification).toMatchObject({ id: "shortage:order-9", kind: "stock_shortage" });
    expect(notification.title).toBe("Falta estoque para o pedido #ML-9");
    expect(notification.detail).toBe(
      "Moletom canguru - Rosa: o fornecedor está sem unidades. Combine com ele ou cancele a venda.",
    );
    expect(notification.href).toBe("/pedidos/order-9");
  });

  it("tells the reseller a supplier cancelled, why, and what to do next", () => {
    const notification = presentNotification({
      kind: "shipment_cancelled",
      entityId: "order-9",
      shipmentId: "shipment-3",
      at,
      externalOrderId: "ML-9",
      supplierName: "Brás Atacado Masculino",
      reason: "Produto em falta no depósito",
    });
    expect(notification).toMatchObject({
      id: "shipment-cancelled:shipment-3",
      kind: "shipment_cancelled",
    });
    expect(notification.title).toBe("Brás Atacado Masculino cancelou o envio do pedido #ML-9");
    expect(notification.detail).toBe(
      "Motivo: Produto em falta no depósito. Reencaminhe ao fornecedor ou cancele a venda.",
    );
    expect(notification.href).toBe("/pedidos/order-9");
  });

  it.each([
    [
      "dispatch_overdue",
      "Despacho atrasado no pedido #ML-9",
      "Brás Atacado Masculino passou do prazo para despachar. Fale com o fornecedor.",
    ],
    [
      "delivery_overdue",
      "Entrega atrasada no pedido #ML-9",
      "Passou da data prevista e o pacote de Brás Atacado Masculino não foi entregue. Confira o rastreio.",
    ],
    [
      "awaiting_confirmation",
      "Confirme a entrega do pedido #ML-9",
      "O pacote de Brás Atacado Masculino foi enviado há mais de 7 dias. Se chegou, marque como entregue.",
    ],
  ] as const)("tells the reseller what is late (%s) and what to do", (delay, title, detail) => {
    const notification = presentNotification({
      kind: "shipment_late",
      entityId: "order-9",
      shipmentId: "shipment-3",
      at,
      externalOrderId: "ML-9",
      supplierName: "Brás Atacado Masculino",
      delay,
    });
    expect(notification).toMatchObject({
      id: `shipment-late:shipment-3:${delay}`,
      kind: "shipment_late",
    });
    expect(notification.title).toBe(title);
    expect(notification.detail).toBe(detail);
    expect(notification.href).toBe("/pedidos/order-9");
  });

  it("shows a sale with its total and leads to the order in the financial report", () => {
    const notification = presentNotification({
      kind: "sale",
      entityId: "order-1",
      at,
      externalOrderId: "MOCK ORD/1",
      totalCents: 4990,
      storeName: "Ana Moda (loja simulada)",
      product: null,
    });
    expect(notification).toMatchObject({ id: "sale:order-1", kind: "sale", at });
    // Currency formatting puts a no-break space after "R$".
    expect(notification.title).toMatch(/^Nova venda de R\$\s49,90$/);
    expect(notification.detail).toBe("MOCK ORD/1 · Ana Moda");
    expect(notification.href).toBe("/financeiro?query=MOCK%20ORD%2F1");
  });

  it("names a sale by what it sold and keeps the picture for the bell", () => {
    const product = {
      title: "Moletom canguru - Rosa",
      imageUrl: null,
      categoryName: "Moda feminina",
    };
    const notification = presentNotification({
      kind: "sale",
      entityId: "order-2",
      at,
      externalOrderId: "MOCK-2",
      totalCents: 12590,
      storeName: "Ana Moda (loja simulada)",
      product,
    });
    expect(notification.detail).toBe("Moletom canguru - Rosa · Ana Moda");
    expect(notification.href).toBe("/financeiro?query=MOCK-2");
    expect(notification.product).toEqual(product);
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
