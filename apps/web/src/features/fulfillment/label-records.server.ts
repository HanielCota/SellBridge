import { logger } from "@sellbridge/shared/logger";

/**
 * Writes a label record without letting it cost the label: a failed record is logged, and the
 * label the marketplace already emitted still reaches whoever asked for it.
 */
export async function keepLabelRecord(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (error) {
    logger.error("fulfillment.label_record_failed", { error });
  }
}
