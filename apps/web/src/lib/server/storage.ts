import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { validationError } from "@sellbridge/shared/errors";
import { env } from "./env.ts";

/**
 * Storage for user files. Development uses the local disk; production can swap in an
 * S3/R2 implementation behind the same interface (see docs/decisions.md).
 */
export interface FileStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export function createLocalFileStorage(rootDirectory: string): FileStorage {
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
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
  };
}

export const fileStorage = createLocalFileStorage(env.UPLOADS_DIR);
