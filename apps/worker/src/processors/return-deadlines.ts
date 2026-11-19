import type { Database } from "@sellbridge/database";
import { closeOverdueReturns } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";

export interface ReturnDeadlinesDependencies {
  readonly database: Database;
  readonly now?: () => Date;
}

/**
 * Closes the returns whose deadline passed: a supplier who did not check the product in time
 * accepts the reseller's version, and a reseller who did not send the parcel on is owed nothing.
 */
export function createReturnDeadlinesProcessor(dependencies: ReturnDeadlinesDependencies) {
  return async function processReturnDeadlines(): Promise<{ closed: number }> {
    const now = dependencies.now?.() ?? new Date();
    const { closed } = await closeOverdueReturns(dependencies.database, now);
    if (closed > 0) {
      logger.info("return_policy.overdue_closed", { closed });
    }
    return { closed };
  };
}
