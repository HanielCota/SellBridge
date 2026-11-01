import { describe, expect, it, vi } from "vitest";
import type { StoredFile } from "@/lib/server/storage";
import {
  DISK_FULL_MESSAGE,
  IMAGE_SPACE_FULL_MESSAGE,
  MAX_SUPPLIER_IMAGE_BYTES,
  MAX_SUPPLIER_IMAGE_FILES,
  makeRoomForProductImage,
} from "./product-image-quota.server";

vi.mock("@sellbridge/shared/logger", () => ({
  logger: {
    info: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
    error: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
    warn: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
  },
}));

const SUPPLIER = "4b0f6d2e-8c1a-4f7e-9a3b-2d5c6e7f8a90";
const NOW = new Date("2026-11-01T12:00:00Z");
const TWO_DAYS_AGO = new Date("2026-10-30T12:00:00Z");
const ONE_HOUR_AGO = new Date("2026-11-01T11:00:00Z");

function photo(name: string, bytes: number, modifiedAt: Date): StoredFile {
  return { key: `product-images/${SUPPLIER}/${name}`, bytes, modifiedAt };
}

const ROOMY_DISK = { freeBytes: 900 * 1024 ** 3, totalBytes: 1000 * 1024 ** 3 };

/** A supplier folder in memory, with the file names some product links to. */
function folder(files: StoredFile[], linked: readonly string[] = [], disk = ROOMY_DISK) {
  const stored = new Map(files.map((file) => [file.key, file]));
  const deleted: string[] = [];
  return {
    deleted,
    dependencies: {
      storage: {
        list: async () => [...stored.values()],
        delete: async (key: string) => {
          stored.delete(key);
          deleted.push(key);
        },
        space: async () => disk,
      },
      linkedFileNames: async () => new Set(linked),
      now: () => NOW,
    },
  };
}

const halfSpace = MAX_SUPPLIER_IMAGE_BYTES / 2;

// Regression (security audit, 31/10/2026): photos were written with no limit on what one
// supplier keeps, and nothing ever removed the ones no product used.
describe("makeRoomForProductImage", () => {
  it("lets a photo in while the supplier's space has room, deleting nothing", async () => {
    const { dependencies, deleted } = folder([photo("a.png", halfSpace, TWO_DAYS_AGO)]);

    await makeRoomForProductImage(dependencies, { supplierId: SUPPLIER, incomingBytes: 1024 });

    expect(deleted).toEqual([]);
  });

  it("refuses a photo past the space when every stored one is in use", async () => {
    const { dependencies, deleted } = folder(
      [photo("a.png", halfSpace, TWO_DAYS_AGO), photo("b.png", halfSpace, TWO_DAYS_AGO)],
      ["a.png", "b.png"],
    );

    const making = makeRoomForProductImage(dependencies, {
      supplierId: SUPPLIER,
      incomingBytes: 1024,
    });

    await expect(making).rejects.toMatchObject({ userMessage: IMAGE_SPACE_FULL_MESSAGE });
    expect(deleted).toEqual([]);
  });

  it("deletes the photos no product uses that are over a day old to make room", async () => {
    const { dependencies, deleted } = folder(
      [
        photo("used.png", halfSpace, TWO_DAYS_AGO),
        photo("forgotten.png", halfSpace, TWO_DAYS_AGO),
        photo("just-sent.png", 1024, ONE_HOUR_AGO),
      ],
      ["used.png"],
    );

    await makeRoomForProductImage(dependencies, { supplierId: SUPPLIER, incomingBytes: 1024 });

    expect(deleted).toEqual([`product-images/${SUPPLIER}/forgotten.png`]);
  });

  it("refuses any photo while the shared disk has less than a tenth free", async () => {
    const almostFull = { freeBytes: 99 * 1024 ** 3, totalBytes: 1000 * 1024 ** 3 };
    const { dependencies, deleted } = folder([], [], almostFull);

    const making = makeRoomForProductImage(dependencies, {
      supplierId: SUPPLIER,
      incomingBytes: 1024,
    });

    await expect(making).rejects.toMatchObject({ userMessage: DISK_FULL_MESSAGE });
    expect(deleted).toEqual([]);
  });

  it("refuses a photo past the file count, however small", async () => {
    const files = Array.from({ length: MAX_SUPPLIER_IMAGE_FILES }, (_file, index) =>
      photo(`${index}.png`, 1, ONE_HOUR_AGO),
    );
    const { dependencies } = folder(files);

    const making = makeRoomForProductImage(dependencies, {
      supplierId: SUPPLIER,
      incomingBytes: 1,
    });

    await expect(making).rejects.toMatchObject({ userMessage: IMAGE_SPACE_FULL_MESSAGE });
  });
});
