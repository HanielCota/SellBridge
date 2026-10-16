import { describe, expect, it } from "vitest";
import { formatCents } from "./money.ts";
import { notificationContentSchema } from "./notification-content.ts";
import {
  channelEnabled,
  listingFailedContent,
  orderDeliveredContent,
  salePaidContent,
  shipmentLateContent,
  storeExpiredContent,
  supportReplyContent,
} from "./notification-events.ts";

const sale = {
  orderId: "o-1",
  externalOrderId: "2000001",
  totalCents: 12_990,
  firstItemTitle: "Fone sem fio",
  itemCount: 3,
};

describe("channelEnabled", () => {
  it("uses the event default when the person never chose", () => {
    expect(channelEnabled("sale_paid", "email", undefined)).toBe(true);
    expect(channelEnabled("order_delivered", "email", undefined)).toBe(false);
  });

  it("follows the saved choice", () => {
    expect(channelEnabled("sale_paid", "email", false)).toBe(false);
    expect(channelEnabled("order_delivered", "email", true)).toBe(true);
  });

  it("never sends on a channel the event cannot use", () => {
    expect(channelEnabled("order_delivered", "in_app", true)).toBe(false);
  });
});

describe("salePaidContent", () => {
  it("says what was sold, for how much, and asks to organize the supplier payment", () => {
    const content = salePaidContent(sale);
    expect(content.subject).toBe(`Venda paga de ${formatCents(12_990)}`);
    expect(content.heading).toBe("Você vendeu Fone sem fio e mais 2 itens");
    expect(content.paragraphs.join(" ")).toContain("Organize seu pagamento ao fornecedor");
    expect(content.actionPath).toBe("/pedidos/o-1");
  });

  it("falls back to the order code when no item is known", () => {
    expect(salePaidContent({ ...sale, firstItemTitle: null, itemCount: 0 }).heading).toBe(
      "Você vendeu o pedido 2000001",
    );
  });
});

describe("every event renders valid content", () => {
  it.each([
    salePaidContent(sale),
    orderDeliveredContent({ orderId: "o-1", externalOrderId: "2000001" }),
    shipmentLateContent({
      orderId: "o-1",
      externalOrderId: "2000001",
      supplierName: "Casa Norte",
      delay: "dispatch_overdue",
    }),
    storeExpiredContent({ storeName: "Loja Centro" }),
    listingFailedContent({ listingTitle: "Fone", reason: null }),
    supportReplyContent({ ticketId: "t-1", subject: "Pedido atrasado" }),
  ])("%#", (content) => {
    expect(notificationContentSchema.safeParse(content).success).toBe(true);
  });
});
