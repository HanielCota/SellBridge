import { logger } from "@sellbridge/shared/logger";
import type { SendEmail } from "@sellbridge/shared/mailer";
import type { OrderMessageAuthor } from "@sellbridge/shared/order-message-email-throttle";
import { supplierOrderMessageEmail } from "@sellbridge/shared/order-message-email";
import type { Database } from "../client.ts";
import {
  findOrderMessageContext,
  queueOrderMessageNotices,
  queueStoreOrderMessageNotices,
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

/** A supplier without a panel reads the message by its link, from its order e-mail. */
async function emailSupplier(context: OrderMessageContext, delivery: OrderMessageDelivery) {
  if (context.supplierEmail === null) {
    logger.info("fulfillment.order_message_no_supplier_email", { orderId: context.orderId });
    return;
  }
  const email = supplierOrderMessageEmail(
    { externalOrderId: context.externalOrderId, forwardedAt: context.forwardedAt },
    delivery.appUrl,
  );
  await delivery.sendEmail({ to: context.supplierEmail, ...email });
}

/**
 * The other side learns by bell and e-mail, each person by their own choice: the store, or the
 * supplier's panel people. A supplier without a panel gets its order e-mail with the link.
 * `messageKey` keeps a retried notice from doubling.
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
  if (context.supplierOrganizationId !== null) {
    await queueStoreOrderMessageNotices(delivery.database, {
      context,
      supplierOrganizationId: context.supplierOrganizationId,
      messageKey: input.messageKey,
    });
    return;
  }
  await emailSupplier(context, delivery);
}
