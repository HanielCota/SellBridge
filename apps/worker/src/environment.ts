import {
  booleanFlagEnvironmentSchema,
  logLevelEnvironmentSchema,
  parseEnvironment,
} from "@sellbridge/shared/environment";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { z } from "zod";

loadRootEnvironmentFile();

const workerEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  APP_URL: z.url(),
  TOKEN_ENCRYPTION_KEY: z.string().refine((value) => Buffer.from(value, "base64").length === 32, {
    message: "deve ser uma chave de 32 bytes em base64",
  }),
  /** Mock connector only: without it the simulated store is shown as not configured. */
  MOCK_WEBHOOK_SECRET: z.string().min(16).optional(),
  LOG_LEVEL: logLevelEnvironmentSchema,
  MOCK_LATENCY_MILLISECONDS: z.coerce.number().int().min(0).default(800),
  MERCADO_LIVRE_CLIENT_ID: z.string().optional(),
  MERCADO_LIVRE_CLIENT_SECRET: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  /**
   * Sellable units kept off the marketplaces, per product, as a buffer against shelf counts
   * that lag behind reality. 0 (the default) offers everything that is sellable.
   */
  STOCK_SAFETY_UNITS: z.coerce.number().int().min(0).max(1000).default(0),
  /** When set, exposes GET /health on this port (container probes, E2E readiness). */
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  /**
   * Lets webhook endpoints point to localhost and private networks (local development only).
   * Off in production: otherwise a customer could make the server call internal services.
   */
  WEBHOOK_ALLOW_PRIVATE_URLS: booleanFlagEnvironmentSchema,
});

export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export const environment: WorkerEnvironment = parseEnvironment(
  workerEnvironmentSchema,
  process.env,
  { renamedVariables: { MOCK_LATENCY_MS: "MOCK_LATENCY_MILLISECONDS" } },
);
