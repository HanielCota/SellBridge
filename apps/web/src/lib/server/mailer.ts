import { AppError, configurationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { environment } from "./environment.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** A hung provider must not hold the request (sign-up, password reset) open. */
const RESEND_TIMEOUT_MILLISECONDS = 10_000;

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

function emailProviderError(status: number | null, cause?: unknown): AppError {
  return new AppError("EXTERNAL_PROVIDER", "Não foi possível enviar o e-mail agora", {
    details: { retryable: true, status },
    cause,
  });
}

async function postToResend(apiKey: string, email: OutgoingEmail): Promise<Response> {
  try {
    return await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: environment.EMAIL_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MILLISECONDS),
    });
  } catch (error) {
    logger.error("email.send_unreachable", { error, subject: email.subject });
    throw emailProviderError(null, error);
  }
}

async function sendWithResend(apiKey: string, email: OutgoingEmail): Promise<void> {
  const response = await postToResend(apiKey, email);
  if (!response.ok) {
    logger.error("email.send_failed", { status: response.status, subject: email.subject });
    throw emailProviderError(response.status);
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
