import { validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { FileStorage, StoredFile } from "@/lib/server/storage";
import { assertUploadDiskHasRoom } from "@/lib/server/upload-disk";
import { productImageFolder } from "./product-image-key";

/**
 * Room for one supplier's photos: a large catalog (500 products with two 500 KB photos) fits; an
 * account sending photos in a loop no longer does (60 uploads of 5 MB every 10 minutes did).
 */
export const MAX_SUPPLIER_IMAGE_BYTES = 500 * 1024 * 1024;
/** Tiny files would take the folder to millions of entries long before the bytes run out. */
export const MAX_SUPPLIER_IMAGE_FILES = 20_000;
/** A photo is sent before its product is saved; one no product uses a day later was dropped. */
const UNLINKED_GRACE_MILLISECONDS = 24 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 50;
export const DISK_FULL_MESSAGE =
  "O envio de fotos está pausado no momento. Fale com o suporte para continuar.";

export const IMAGE_SPACE_FULL_MESSAGE =
  "O espaço de fotos deste fornecedor está cheio. Fale com o suporte para liberar mais espaço.";

export interface ImageQuotaDependencies {
  readonly storage: Pick<FileStorage, "list" | "delete" | "space">;
  /** File names in the supplier's folder that some product still links to. */
  readonly linkedFileNames: (supplierId: string) => Promise<ReadonlySet<string>>;
  readonly now: () => Date;
}

function fitsAnother(files: readonly StoredFile[], incomingBytes: number): boolean {
  const usedBytes = files.reduce((total, file) => total + file.bytes, 0);
  return (
    files.length < MAX_SUPPLIER_IMAGE_FILES && usedBytes + incomingBytes <= MAX_SUPPLIER_IMAGE_BYTES
  );
}

function fileNameOf(key: string): string {
  return key.split("/").at(-1) ?? "";
}

async function deleteAll(storage: ImageQuotaDependencies["storage"], files: readonly StoredFile[]) {
  for (let start = 0; start < files.length; start += DELETE_BATCH_SIZE) {
    const batch = files.slice(start, start + DELETE_BATCH_SIZE);
    await Promise.all(batch.map(async (file) => storage.delete(file.key)));
  }
}

/**
 * Makes sure one more photo of `incomingBytes` fits the shared disk and the supplier's space.
 * When the supplier's space is full, the photos no product uses that are over a day old are
 * deleted first.
 *
 * @throws {AppError} VALIDATION when the disk is almost full, or the supplier's space is still
 * full after that.
 */
export async function makeRoomForProductImage(
  dependencies: ImageQuotaDependencies,
  input: { supplierId: string; incomingBytes: number },
): Promise<void> {
  await assertUploadDiskHasRoom(dependencies.storage, input.incomingBytes, DISK_FULL_MESSAGE);
  const files = await dependencies.storage.list(productImageFolder(input.supplierId));
  if (fitsAnother(files, input.incomingBytes)) {
    return;
  }

  const linked = await dependencies.linkedFileNames(input.supplierId);
  const cutoff = dependencies.now().getTime() - UNLINKED_GRACE_MILLISECONDS;
  const isKept = (file: StoredFile) =>
    linked.has(fileNameOf(file.key)) || file.modifiedAt.getTime() >= cutoff;
  const kept: StoredFile[] = [];
  const stale: StoredFile[] = [];
  for (const file of files) {
    if (isKept(file)) {
      kept.push(file);
      continue;
    }
    stale.push(file);
  }
  await deleteAll(dependencies.storage, stale);
  logger.info("supplier_panel.unlinked_images_removed", {
    supplierId: input.supplierId,
    files: stale.length,
  });
  if (fitsAnother(kept, input.incomingBytes)) {
    return;
  }

  logger.warn("supplier_panel.image_space_full", {
    supplierId: input.supplierId,
    files: kept.length,
  });
  throw validationError(IMAGE_SPACE_FULL_MESSAGE);
}
