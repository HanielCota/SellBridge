import type { Database } from "@sellbridge/database";
import { autoCloseIdleTickets } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { daysBefore } from "@sellbridge/shared/time";
import { AUTO_CLOSE_AFTER_DAYS } from "@sellbridge/shared/ticket-rules";

export interface TicketAutoCloseDependencies {
  readonly database: Database;
  readonly now?: () => Date;
}

/**
 * Closes tickets support answered and the reseller did not come back to within
 * AUTO_CLOSE_AFTER_DAYS. Writing again reopens them, so nothing is lost.
 */
export function createTicketAutoCloseProcessor(dependencies: TicketAutoCloseDependencies) {
  return async function processTicketAutoClose(): Promise<{ closed: number }> {
    const now = dependencies.now?.() ?? new Date();
    const before = daysBefore(AUTO_CLOSE_AFTER_DAYS, now);
    const closed = await autoCloseIdleTickets(dependencies.database, { before, now });
    if (closed > 0) {
      logger.info("support.tickets_auto_closed", { closed });
    }
    return { closed };
  };
}
