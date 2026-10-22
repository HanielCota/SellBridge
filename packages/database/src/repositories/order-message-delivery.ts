import { logger } from "@sellbridge/shared/logger";
import type { SendEmail } from "@sellbridge/shared/mailer";
import type { OrderMessageAuthor } from "@sellbridge/shared/order-message-email-throttle";
import { supplierOrderMessageEmail } from "@sellbridge/shared/order-message-email";
import type { Database } from "../client.ts";
import {
  findOrderMessageContext,
  queueOrderMessageNotices,
  type OrderMessageContext,
} from "./order-message-notices.ts";

/*
 * Sends the "new message" notice to the side that did not write. Shared by the web app (right
 * after a message is saved) and the worker (the follow-up at the end of the window), so both
 * say the same thing the same way. The text of the message is never in it.
 */

export interface OrderMessageDelivery {
  database: Database;
  sendEmail: SendEmail;
  appUrl: string;
}

/** The panel's order list, filtered to the order: it opens only after the supplier signs in. */
function supplierPanelUrl(context: OrderMessageContext, appUrl: string): string | null {
  if (!context.supplierHasAccount) {
    return null;
  }
  const path = `/fornecedor/painel/pedidos?query=${encodeURIComponent(context.externalOrderId)}`;
  return new URL(path, appUrl).toString();
}

async function emailSupplier(context: OrderMessageContext, delivery: OrderMessageDelivery) {
  if (context.supplierEmail === null) {
    logger.info("fulfillment.order_message_no_supplier_email", { orderId: context.orderId });
    return;
  }
  const email = supplierOrderMessageEmail(
    {
      externalOrderId: context.externalOrderId,
      forwardedAt: context.forwardedAt,
      panelUrl: supplierPanelUrl(context, delivery.appUrl),
    },
    delivery.appUrl,
  );
  await delivery.sendEmail({ to: context.supplierEmail, ...email });
}

/**
 * The store learns by bell and e-mail (each person's choice); the supplier by its order e-mail
 * only (no supplier bell in the MVP). `messageKey` keeps a retried store notice from doubling.
 */
export async function deliverOrderMessageNotice(
  delivery: OrderMessageDelivery,
  input: { shipmentId: string; author: OrderMessageAuthor; messageKey: string },
): Promise<void> {
  const context = await findOrderMessageContext(delivery.database, input.shipmentId);
  if (context === null) {
    return;
  }
  if (input.author === "supplier") {
    await queueOrderMessageNotices(delivery.database, { context, messageKey: input.messageKey });
    return;
  }
  await emailSupplier(context, delivery);
}
