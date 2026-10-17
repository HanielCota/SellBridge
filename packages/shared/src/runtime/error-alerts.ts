import { type ErrorLogEntry, logger, setErrorLogListener } from "./logger.ts";

/** Item 32.a: error-level logs posted to a chat webhook (Slack, Discord, Google Chat). */
export interface ErrorAlertOptions {
  /** ALERT_WEBHOOK_URL; undefined keeps alerts off. */
  webhookUrl: string | undefined;
  /** Which process raised the error ("web", "worker"). */
  service: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** How long the same event stays quiet after an alert. */
  cooldownMilliseconds?: number;
}

const DEFAULT_COOLDOWN_MILLISECONDS = 5 * 60 * 1000;
const DELIVERY_TIMEOUT_MILLISECONDS = 3000;
/** Discord refuses messages over 2000 characters; Slack and Google Chat accept more. */
const MAXIMUM_MESSAGE_LENGTH = 1900;

interface EventWindow {
  sentAt: number;
  repeats: number;
}

function alertText(service: string, entry: ErrorLogEntry, repeats: number): string {
  const header = `[SellBridge ${service}] erro: ${entry.event}`;
  const repeated = repeats > 0 ? ` (+${repeats} repetições desde o último alerta)` : "";
  const text = `${header}${repeated}\n${entry.line}`;
  if (text.length <= MAXIMUM_MESSAGE_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAXIMUM_MESSAGE_LENGTH - 1)}…`;
}

/**
 * Best effort and never retried: a repeated alert is noise, and a slow webhook must not hold
 * the request or job that logged the error. Failures are a warning, so they never alert again.
 */
async function deliver(fetchImplementation: typeof fetch, url: string, text: string) {
  try {
    const response = await fetchImplementation(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Slack and Google Chat read `text`; Discord reads `content`.
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) {
      logger.warn("alerts.delivery_failed", { status: response.status });
    }
  } catch (error) {
    logger.warn("alerts.delivery_failed", { error });
  }
}

/** Starts posting error logs to the webhook; returns the function that stops it. */
export function installErrorAlerts(options: ErrorAlertOptions): () => void {
  const { webhookUrl } = options;
  if (webhookUrl === undefined) {
    return () => undefined;
  }
  const fetchImplementation = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const cooldown = options.cooldownMilliseconds ?? DEFAULT_COOLDOWN_MILLISECONDS;
  const windows = new Map<string, EventWindow>();

  setErrorLogListener((entry) => {
    const current = now();
    const window = windows.get(entry.event);
    if (window !== undefined && current - window.sentAt < cooldown) {
      windows.set(entry.event, { ...window, repeats: window.repeats + 1 });
      return;
    }
    windows.set(entry.event, { sentAt: current, repeats: 0 });
    const text = alertText(options.service, entry, window?.repeats ?? 0);
    void deliver(fetchImplementation, webhookUrl, text);
  });
  return () => setErrorLogListener(null);
}
