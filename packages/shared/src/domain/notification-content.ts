import { z } from "zod";

/** Where a notification can reach a person. In-app is the bell; the others are queued. */
export const NOTIFICATION_CHANNELS = ["in_app", "email", "push"] as const;
export type NotificationChannelName = (typeof NOTIFICATION_CHANNELS)[number];

/** Channels that go through the delivery queue (the bell reads live data instead). */
export const QUEUED_NOTIFICATION_CHANNELS = ["email", "push"] as const;
export type QueuedNotificationChannel = (typeof QUEUED_NOTIFICATION_CHANNELS)[number];

/**
 * A path inside the app ("/pedidos/…"). Never a full URL: the worker joins it to APP_URL, so a
 * stored notification can't send anyone to another site.
 */
const appPathSchema = z
  .string()
  .max(300)
  .regex(/^\/(?!\/)[^\s\\]*$/, "caminho interno, começando com uma só barra");

/**
 * The message itself, rendered when the fact happens and stored with the delivery: the worker
 * only formats it for its channel, so a later change to the data does not change what was said.
 */
export const notificationContentSchema = z.object({
  subject: z.string().min(1).max(160),
  preview: z.string().max(200),
  heading: z.string().min(1).max(160),
  paragraphs: z.array(z.string().min(1).max(1000)).min(1).max(6),
  actionLabel: z.string().min(1).max(60),
  actionPath: appPathSchema,
  footnote: z.string().max(300),
});
export type NotificationContent = z.infer<typeof notificationContentSchema>;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Wait after the 1st, 2nd... failed attempt: about 3 hours from first try to giving up. */
export const NOTIFICATION_RETRY_DELAYS_MILLISECONDS: readonly number[] = [
  MINUTE,
  5 * MINUTE,
  30 * MINUTE,
  2 * HOUR,
];

/** Attempts per delivery, the first included; afterwards the delivery is marked "failed". */
export const NOTIFICATION_MAX_ATTEMPTS = NOTIFICATION_RETRY_DELAYS_MILLISECONDS.length + 1;

/**
 * When to try again after `attemptsMade` attempts (the failed one included), or null when
 * attempts ran out.
 */
export function nextNotificationAttemptAt(attemptsMade: number, now: Date): Date | null {
  if (attemptsMade >= NOTIFICATION_MAX_ATTEMPTS) {
    return null;
  }
  const delay = NOTIFICATION_RETRY_DELAYS_MILLISECONDS[Math.max(attemptsMade, 1) - 1];
  if (delay === undefined) {
    return null;
  }
  return new Date(now.getTime() + delay);
}
