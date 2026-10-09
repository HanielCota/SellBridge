import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Loads the monorepo root `.env` into process.env (Node only).
 * Walks up from the current directory until it finds `pnpm-workspace.yaml`.
 * Missing `.env` is not an error: variables may come from the real environment.
 */
export function loadRootEnvironmentFile(startDirectory: string = process.cwd()): void {
  const root = findWorkspaceRoot(startDirectory);
  if (!root) {
    return;
  }
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    return;
  }
  process.loadEnvFile(envPath);
}

function findWorkspaceRoot(directory: string): string | null {
  if (existsSync(join(directory, "pnpm-workspace.yaml"))) {
    return directory;
  }
  const parent = dirname(directory);
  if (parent === directory) {
    return null;
  }
  return findWorkspaceRoot(parent);
}
