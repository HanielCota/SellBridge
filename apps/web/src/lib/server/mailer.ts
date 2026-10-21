import { createMailer } from "@sellbridge/shared/mailer";
import { environment } from "./environment.ts";

export type { OutgoingEmail } from "@sellbridge/shared/mailer";

/**
 * Sends a transactional e-mail through Resend. Without RESEND_API_KEY, development prints
 * the message to the log (so links can be opened locally) and production refuses to send.
 */
export const sendEmail = createMailer({
  apiKey: environment.RESEND_API_KEY,
  from: environment.EMAIL_FROM,
  production: environment.NODE_ENV === "production",
});
