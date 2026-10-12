import type { Database } from "@sellbridge/database";
import { autoCloseIdleTickets } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { AUTO_CLOSE_AFTER_DAYS } from "@sellbridge/shared/ticket-rules";

const DAY_MILLISECONDS = 86_400_000;

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
    const before = new Date(now.getTime() - AUTO_CLOSE_AFTER_DAYS * DAY_MILLISECONDS);
    const closed = await autoCloseIdleTickets(dependencies.database, { before, now });
    if (closed > 0) {
      logger.info("support.tickets_auto_closed", { closed });
    }
    return { closed };
  };
}
