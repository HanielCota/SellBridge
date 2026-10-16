import type { Database } from "@sellbridge/database";
import {
  claimDueNotificationDeliveries,
  markNotificationAttemptFailed,
  markNotificationSent,
  markNotificationSkipped,
  type DueNotificationDelivery,
} from "@sellbridge/database/repositories";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { SendEmail } from "@sellbridge/shared/mailer";
import { nextNotificationAttemptAt } from "@sellbridge/shared/notification-content";
import {
  createEmailChannel,
  createPushChannel,
  type ChannelOutcome,
  type NotificationChannel,
} from "../lib/notification-channels.ts";

export interface NotificationDeliveryDependencies {
  database: Database;
  sendEmail: SendEmail;
  appUrl: string;
  now?: () => Date;
  /** Tests only: claim one tenant's deliveries so parallel test files don't take each other's. */
  tenantId?: string;
}

export interface NotificationDeliverySummary {
  sent: number;
  failed: number;
  skipped: number;
}

/** Deliveries per run (every 10 s), sent concurrently. */
const BATCH_SIZE = 25;
/** Longer than an e-mail send can take (the mailer times out at 10 s). */
const LEASE_MILLISECONDS = 2 * 60 * 1000;

type AttemptResult = ChannelOutcome | { status: "failed"; error: string };

/** Provider messages may echo addresses; only our own messages are stored as written. */
function attemptErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.userMessage;
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "Tempo esgotado";
  }
  return "Falha no envio";
}

async function tryDeliver(
  channel: NotificationChannel,
  delivery: DueNotificationDelivery,
): Promise<AttemptResult> {
  try {
    return await channel.deliver(delivery);
  } catch (error) {
    logger.warn("notification.channel_failed", {
      deliveryId: delivery.id,
      channel: delivery.channel,
      error,
    });
    return { status: "failed", error: attemptErrorMessage(error) };
  }
}

async function recordResult(
  database: Database,
  delivery: DueNotificationDelivery,
  result: AttemptResult,
  now: Date,
): Promise<void> {
  if (result.status === "sent") {
    await markNotificationSent(database, delivery.id, now);
    return;
  }
  if (result.status === "skipped") {
    await markNotificationSkipped(database, delivery.id, result.reason);
    return;
  }
  const nextAttemptAt = nextNotificationAttemptAt(delivery.attempts + 1, now);
  await markNotificationAttemptFailed(database, delivery.id, {
    error: result.error,
    nextAttemptAt,
  });
  logger.warn("notification.delivery_failed", {
    deliveryId: delivery.id,
    event: delivery.event,
    attempt: delivery.attempts + 1,
    final: nextAttemptAt === null,
  });
}

/** A bookkeeping failure (the database) must not drop the batch; the lease expires and it retries. */
async function attemptSafely(
  dependencies: NotificationDeliveryDependencies,
  channels: ReadonlyMap<string, NotificationChannel>,
  delivery: DueNotificationDelivery,
  now: Date,
): Promise<AttemptResult["status"] | null> {
  const channel = channels.get(delivery.channel);
  if (channel === undefined) {
    return null;
  }
  try {
    const result = await tryDeliver(channel, delivery);
    await recordResult(dependencies.database, delivery, result, now);
    return result.status;
  } catch (error) {
    logger.error("notification.delivery_bookkeeping_failed", { deliveryId: delivery.id, error });
    return null;
  }
}

function summarize(statuses: readonly (AttemptResult["status"] | null)[]) {
  return {
    sent: statuses.filter((status) => status === "sent").length,
    failed: statuses.filter((status) => status === "failed").length,
    skipped: statuses.filter((status) => status === "skipped").length,
  };
}

/** Sends due e-mail and push notifications, recording each attempt with its retry time. */
export function createNotificationDeliveryProcessor(
  dependencies: NotificationDeliveryDependencies,
) {
  const currentTime = dependencies.now ?? (() => new Date());
  const channels = new Map<string, NotificationChannel>(
    [createEmailChannel(dependencies.sendEmail, dependencies.appUrl), createPushChannel()].map(
      (channel) => [channel.name, channel],
    ),
  );

  return async function processNotificationDeliveries(): Promise<NotificationDeliverySummary> {
    const now = currentTime();
    const deliveries = await claimDueNotificationDeliveries(dependencies.database, {
      tenantId: dependencies.tenantId,
      now,
      limit: BATCH_SIZE,
      leaseMilliseconds: LEASE_MILLISECONDS,
    });
    const statuses = await Promise.all(
      deliveries.map(async (delivery) => attemptSafely(dependencies, channels, delivery, now)),
    );
    return summarize(statuses);
  };
}
