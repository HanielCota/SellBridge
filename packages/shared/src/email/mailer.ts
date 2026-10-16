import { AppError, configurationError } from "../runtime/errors.ts";
import { logger } from "../runtime/logger.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** A hung provider must not hold the caller (a sign-up, a forward) open. */
const RESEND_TIMEOUT_MILLISECONDS = 10_000;

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML part; `text` stays as the fallback for clients without HTML. */
  html?: string;
}

/** Sends one e-mail; rejects with an `AppError` that says whether a later try may pass. */
export type SendEmail = (email: OutgoingEmail) => Promise<void>;

export interface MailerOptions {
  /** Resend API key; without it development prints the e-mail and production refuses. */
  apiKey: string | undefined;
  /** Sender, as "Name <address>". */
  from: string;
  production: boolean;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

/**
 * Network failures, timeouts (status null), 429 and 5xx can pass on a later try; any other 4xx
 * (an invalid address, a rejected sender) will fail the same way again.
 */
function isRetryableStatus(status: number | null): boolean {
  return status === null || status === 429 || status >= 500;
}

function emailProviderError(status: number | null, cause?: unknown): AppError {
  return new AppError("EXTERNAL_PROVIDER", "Não foi possível enviar o e-mail agora", {
    details: { retryable: isRetryableStatus(status), status },
    cause,
  });
}

async function postToResend(
  options: MailerOptions & { apiKey: string },
  email: OutgoingEmail,
): Promise<Response> {
  const send = options.fetch ?? fetch;
  try {
    return await send(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: options.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MILLISECONDS),
    });
  } catch (error) {
    logger.error("email.send_unreachable", { error, subject: email.subject });
    throw emailProviderError(null, error);
  }
}

/**
 * A transactional e-mail sender over Resend, for the web app and the worker alike. The
 * recipient is never logged: it is an e-mail address, which the logs must not carry.
 */
export function createMailer(options: MailerOptions): SendEmail {
  return async function sendEmail(email: OutgoingEmail): Promise<void> {
    const apiKey = options.apiKey;
    if (apiKey === undefined) {
      if (options.production) {
        throw configurationError("RESEND_API_KEY não configurada: não é possível enviar e-mails");
      }
      // Development: the message goes to the log, so links can be opened locally.
      logger.info("email.development_preview", { subject: email.subject, body: email.text });
      return;
    }
    const response = await postToResend({ ...options, apiKey }, email);
    if (!response.ok) {
      logger.error("email.send_failed", { status: response.status, subject: email.subject });
      throw emailProviderError(response.status);
    }
    logger.info("email.sent", { subject: email.subject });
  };
}
