import { parseEnvironment } from "@sellbridge/shared/environment";
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
  MOCK_WEBHOOK_SECRET: z.string().min(16).default("mock-webhook-secret-dev-only"),
  MOCK_LATENCY_MS: z.coerce.number().int().min(0).default(800),
  MERCADO_LIVRE_CLIENT_ID: z.string().optional(),
  MERCADO_LIVRE_CLIENT_SECRET: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  /** When set, exposes GET /health on this port (container probes, E2E readiness). */
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
});

export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export const environment: WorkerEnvironment = parseEnvironment(
  workerEnvironmentSchema,
  process.env,
);
