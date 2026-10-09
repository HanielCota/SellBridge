import { parseEnv } from "@sellbridge/shared/env";
import { loadRootEnv } from "@sellbridge/shared/env-node";
import { z } from "zod";

loadRootEnv();

const workerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  APP_URL: z.url(),
  TOKEN_ENCRYPTION_KEY: z.string().refine((value) => Buffer.from(value, "base64").length === 32, {
    message: "deve ser uma chave de 32 bytes em base64",
  }),
  MOCK_WEBHOOK_SECRET: z.string().min(16).default("mock-webhook-secret-dev-only"),
  MOCK_LATENCY_MS: z.coerce.number().int().min(0).default(800),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  /** When set, exposes GET /health on this port (container probes, E2E readiness). */
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export const env: WorkerEnv = parseEnv(workerEnvSchema, process.env);
