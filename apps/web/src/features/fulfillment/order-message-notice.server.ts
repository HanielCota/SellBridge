import { deliverOrderMessageNotice, orderMessageMoments } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  planOrderMessageEmail,
  type OrderMessageAuthor,
} from "@sellbridge/shared/order-message-email-throttle";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { sendEmail } from "@/lib/server/mailer";
import { enqueueOrderMessageFollowUp } from "@/lib/server/queues";

/**
 * Tells the other side a message arrived, at most once per author and parcel every 15 minutes
 * and at least once while messages wait: a message inside the window is e-mailed by a job at the
 * window's end, unless the other side answers first. Runs after the message is saved and never
 * undoes it: a failure is logged with ids only, never the text.
 */
export async function noticeOrderMessage(input: {
  shipmentId: string;
  author: OrderMessageAuthor;
  messageKey: string;
}): Promise<void> {
  try {
    const messages = await orderMessageMoments(database, input.shipmentId);
    const plan = planOrderMessageEmail({
      messages,
      author: input.author,
      trigger: "message",
      now: new Date(),
    });
    if (plan.sendNow) {
      await deliverOrderMessageNotice({ database, sendEmail, appUrl: environment.APP_URL }, input);
    }
    if (plan.followUpAt !== null) {
      await enqueueOrderMessageFollowUp({
        shipmentId: input.shipmentId,
        author: input.author,
        runAt: plan.followUpAt,
      });
    }
  } catch (error) {
    logger.warn("fulfillment.order_message_notice_failed", {
      shipmentId: input.shipmentId,
      author: input.author,
      error,
    });
  }
}
