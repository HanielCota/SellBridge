import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { validationError } from "@sellbridge/shared/errors";
import { environment } from "./environment.ts";

/**
 * Storage for user files. Development uses the local disk; production can swap in an
 * S3/R2 implementation behind the same interface (see docs/decisions.md).
 */
export interface StoredFile {
  readonly key: string;
  readonly bytes: number;
  readonly modifiedAt: Date;
}

export interface FileStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  /** Removes the file; a missing file is not an error. */
  delete(key: string): Promise<void>;
  /** The files directly inside the folder `prefix`; a missing folder has none. */
  list(prefix: string): Promise<StoredFile[]>;
}

/** Files measured at once when listing a folder: thousands of photos never open thousands of handles. */
const LIST_BATCH_SIZE = 100;

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function fileNamesIn(folder: string): Promise<string[]> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if (isMissing(error)) {
      return [];
    }
    throw error;
  }
}

function createLocalFileStorage(rootDirectory: string): FileStorage {
  const root = resolve(rootDirectory);

  function pathFor(key: string): string {
    const target = resolve(root, key);
    if (!target.startsWith(`${root}${sep}`)) {
      throw validationError("Caminho de arquivo inválido");
    }
    return target;
  }

  return {
    async put(key, bytes) {
      const target = pathFor(key);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch (error) {
        if (isMissing(error)) {
          return null;
        }
        throw error;
      }
    },
    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
    async list(prefix) {
      const names = await fileNamesIn(pathFor(prefix));
      const files: StoredFile[] = [];
      for (let start = 0; start < names.length; start += LIST_BATCH_SIZE) {
        const batch = names.slice(start, start + LIST_BATCH_SIZE);
        const measured = await Promise.all(
          batch.map(async (name) => {
            const key = `${prefix}/${name}`;
            const info = await stat(pathFor(key));
            return { key, bytes: info.size, modifiedAt: info.mtime };
          }),
        );
        files.push(...measured);
      }
      return files;
    },
  };
}

export const fileStorage = createLocalFileStorage(environment.UPLOADS_DIR);
