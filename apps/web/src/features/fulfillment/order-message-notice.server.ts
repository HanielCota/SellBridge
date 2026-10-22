import {
  findOrderMessageContext,
  queueOrderMessageNotices,
  type OrderMessageContext,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { supplierOrderMessageEmail } from "@sellbridge/shared/order-message-email";
import type { ShipmentOperator } from "@sellbridge/shared/schemas";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { sendEmail } from "@/lib/server/mailer";

/** The panel's order list, filtered to the order: it opens only after the supplier signs in. */
function supplierPanelUrl(context: OrderMessageContext): string | null {
  if (!context.supplierHasAccount) {
    return null;
  }
  const path = `/fornecedor/painel/pedidos?query=${encodeURIComponent(context.externalOrderId)}`;
  return new URL(path, environment.APP_URL).toString();
}

async function emailSupplier(context: OrderMessageContext): Promise<void> {
  if (context.supplierEmail === null) {
    logger.info("fulfillment.order_message_no_supplier_email", { orderId: context.orderId });
    return;
  }
  const email = supplierOrderMessageEmail(
    {
      externalOrderId: context.externalOrderId,
      forwardedAt: context.forwardedAt,
      panelUrl: supplierPanelUrl(context),
    },
    environment.APP_URL,
  );
  await sendEmail({ to: context.supplierEmail, ...email });
}

/**
 * Tells the other side a message arrived: the store's people by bell and e-mail (their own
 * choices), the supplier by its order e-mail only (no bell for suppliers in the MVP). Runs after
 * the message is saved and never undoes it: a failure is logged with ids only, never the text.
 */
export async function noticeOrderMessage(input: {
  shipmentId: string;
  author: ShipmentOperator;
  messageKey: string;
}): Promise<void> {
  try {
    const context = await findOrderMessageContext(database, input.shipmentId);
    if (context === null) {
      return;
    }
    if (input.author === "supplier") {
      await queueOrderMessageNotices(database, { context, messageKey: input.messageKey });
      return;
    }
    await emailSupplier(context);
  } catch (error) {
    logger.warn("fulfillment.order_message_notice_failed", {
      shipmentId: input.shipmentId,
      author: input.author,
      error,
    });
  }
}
