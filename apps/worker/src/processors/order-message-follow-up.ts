import { logger } from "@sellbridge/shared/logger";
import {
  planOrderMessageEmail,
  type OrderMessageAuthor,
  type OrderMessageMoment,
} from "@sellbridge/shared/order-message-email-throttle";
import { orderMessageFollowUpJobSchema } from "@sellbridge/shared/queues";
import type { JobContext } from "../lib/job-context.ts";

interface OrderMessageFollowUpDependencies {
  /** Every message of the parcel, both sides (`orderMessageMoments`). */
  loadMessages: (shipmentId: string) => Promise<OrderMessageMoment[]>;
  /** Sends the notice to the side that did not write (`deliverOrderMessageNotice`). */
  deliver: (input: {
    shipmentId: string;
    author: OrderMessageAuthor;
    messageKey: string;
  }) => Promise<void>;
  now?: () => Date;
}

/**
 * The end of a 15-minute window: e-mails the other side if a message of the author still waits,
 * and does nothing if it was already e-mailed or the other side answered in the conversation.
 * Replays the parcel's messages (`planOrderMessageEmail`), like the web app did when it held the
 * e-mail back, so both agree without any record of what was sent.
 */
export function createOrderMessageFollowUpProcessor(
  dependencies: OrderMessageFollowUpDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  return async function processOrderMessageFollowUp(job: JobContext): Promise<void> {
    const data = orderMessageFollowUpJobSchema.parse(job.data);
    const at = now();
    const messages = await dependencies.loadMessages(data.shipmentId);
    const plan = planOrderMessageEmail({
      messages,
      author: data.author,
      trigger: "follow_up",
      now: at,
    });
    if (!plan.sendNow) {
      logger.info("fulfillment.order_message_follow_up_skipped", { ...data });
      return;
    }
    await dependencies.deliver({
      ...data,
      messageKey: `follow-up:${data.shipmentId}:${data.author}:${at.getTime()}`,
    });
  };
}
