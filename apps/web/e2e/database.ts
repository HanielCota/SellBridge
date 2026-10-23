import { createDatabase } from "@sellbridge/database/client";
import { requireEnvironmentVariable } from "./environment";

/**
 * Connections each spec file may open. The local Postgres takes 100 and is shared by every chat
 * testing at once; specs only seed and read a few rows, and the old pool of 10 per spec file ran
 * it out ("sorry, too many clients already"). `E2E_DB_POOL` overrides it, to measure.
 */
const E2E_POOL_SIZE = 2;

/** The name the specs' connections carry in `pg_stat_activity`. */
export const E2E_APPLICATION_NAME = "sellbridge-e2e-specs";

/** The pool size from `E2E_DB_POOL`, or the default; anything but a positive integer is refused. */
function poolSize(): number {
  const configured = process.env.E2E_DB_POOL;
  if (configured === undefined || configured.trim() === "") {
    return E2E_POOL_SIZE;
  }
  const size = Number(configured);
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`E2E_DB_POOL inválida: "${configured}" (use um inteiro positivo)`);
  }
  return size;
}

/** The database a spec file seeds and reads, with a small, named pool. */
export function e2eDatabase() {
  return createDatabase(requireEnvironmentVariable("DATABASE_URL"), {
    maxConnections: poolSize(),
    applicationName: E2E_APPLICATION_NAME,
  });
}
