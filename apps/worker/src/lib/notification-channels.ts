import type { DueNotificationDelivery } from "@sellbridge/database/repositories";
import { renderActionEmail } from "@sellbridge/shared/email-layout";
import type { SendEmail } from "@sellbridge/shared/mailer";
import type { QueuedNotificationChannel } from "@sellbridge/shared/notification-content";

/** `skipped`: the channel cannot deliver at all; retrying would not help. */
export type ChannelOutcome = { status: "sent" } | { status: "skipped"; reason: string };

/**
 * One way of reaching a person. Throwing means a transient failure (retried with backoff);
 * `skipped` means the channel cannot deliver this at all.
 */
export interface NotificationChannel {
  readonly name: QueuedNotificationChannel;
  deliver(delivery: DueNotificationDelivery): Promise<ChannelOutcome>;
}

/** E-mail in the branded layout; the stored path becomes a link under APP_URL. */
export function createEmailChannel(sendEmail: SendEmail, appUrl: string): NotificationChannel {
  return {
    name: "email",
    async deliver(delivery) {
      const { actionPath, ...content } = delivery.content;
      const email = renderActionEmail(
        { ...content, actionUrl: new URL(actionPath, appUrl).toString() },
        appUrl,
      );
      await sendEmail({ to: delivery.recipientEmail, ...email });
      return { status: "sent" };
    },
  };
}

/** No push provider is chosen yet: deliveries are recorded and closed as skipped. */
export function createPushChannel(): NotificationChannel {
  return {
    name: "push",
    async deliver() {
      return { status: "skipped", reason: "Push ainda não configurado" };
    },
  };
}
