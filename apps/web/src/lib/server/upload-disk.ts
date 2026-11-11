import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { FileStorage } from "./storage";

/**
 * Below this share of free disk no upload is accepted. Anyone can open an account, so per-account
 * limits alone do not keep the disk the whole site shares from filling up.
 */
const MIN_FREE_DISK_SHARE = 0.1;

/**
 * Refuses an upload of `incomingBytes` when the shared disk would keep less than a tenth free.
 *
 * @throws {AppError} VALIDATION with `refusalMessage` when the disk is almost full.
 */
export async function assertUploadDiskHasRoom(
  storage: Pick<FileStorage, "space">,
  incomingBytes: number,
  refusalMessage: string,
): Promise<void> {
  const { freeBytes, totalBytes } = await storage.space();
  if (totalBytes <= 0) {
    throw new Error(`Uploads disk reports a total of ${totalBytes} bytes`);
  }

  const freeShare = (freeBytes - incomingBytes) / totalBytes;
  if (freeShare >= MIN_FREE_DISK_SHARE) {
    return;
  }

  // Error level: the team hears of it in the alert channel, at most once per alert window.
  logger.error("uploads.disk_almost_full", { freePercent: Math.floor(freeShare * 100) });
  throw validationError(refusalMessage);
}
