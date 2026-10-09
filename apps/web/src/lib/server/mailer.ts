import { configurationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { environment } from "./environment.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

async function sendWithResend(apiKey: string, email: OutgoingEmail): Promise<void> {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: environment.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: email.text,
    }),
  });
  if (!response.ok) {
    logger.error("email.send_failed", { status: response.status, subject: email.subject });
    throw new Error(`O provedor de e-mail respondeu ${response.status}`);
  }
  logger.info("email.sent", { subject: email.subject });
}

/**
 * Sends a transactional e-mail through Resend. Without RESEND_API_KEY, development prints
 * the message to the log (so links can be opened locally) and production refuses to send.
 */
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const apiKey = environment.RESEND_API_KEY;
  if (apiKey) {
    await sendWithResend(apiKey, email);
    return;
  }
  if (environment.NODE_ENV === "production") {
    throw configurationError("RESEND_API_KEY não configurada: não é possível enviar e-mails");
  }
  logger.info("email.development_preview", { subject: email.subject, body: email.text });
}
