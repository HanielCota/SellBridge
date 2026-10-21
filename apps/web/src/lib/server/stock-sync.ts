import { withDeadline } from "@sellbridge/shared/deadline";
import { logger } from "@sellbridge/shared/logger";
import { enqueueStockPriceSync } from "@/lib/server/queues";

/**
 * Asks the worker to push stock and prices now. The write that changed stock is already saved,
 * so a slow or missing Redis only logs `failureEvent`: the scheduled sync catches up.
 */
export async function requestStockSync(failureEvent: string): Promise<boolean> {
  try {
    await withDeadline(enqueueStockPriceSync(), 3000, "Sincronização do estoque");
    return true;
  } catch (error) {
    logger.warn(failureEvent, { error });
    return false;
  }
}
