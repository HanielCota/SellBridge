import { createEmailQuota } from "@sellbridge/shared/email-quota";
import { createMailer } from "@sellbridge/shared/mailer";
import { environment } from "./environment.ts";
import { sharedEmailQuotaStore } from "./queues.ts";

export type { OutgoingEmail } from "@sellbridge/shared/mailer";

/**
 * Sends a transactional e-mail through Resend. Without RESEND_API_KEY, development prints
 * the message to the log (so links can be opened locally) and production refuses to send.
 * Every e-mail counts against the daily allowance the worker shares.
 */
export const sendEmail = createMailer({
  apiKey: environment.RESEND_API_KEY,
  from: environment.EMAIL_FROM,
  production: environment.NODE_ENV === "production",
  quota: createEmailQuota({
    store: sharedEmailQuotaStore,
    limits: {
      accountDaily: environment.EMAIL_ACCOUNT_DAILY_CAP,
      accountPerRecipientDaily: environment.EMAIL_ACCOUNT_DAILY_CAP_PER_RECIPIENT,
      generalDaily: environment.EMAIL_DAILY_CAP,
      generalPerRecipientDaily: environment.EMAIL_DAILY_CAP_PER_RECIPIENT,
    },
  }),
});
