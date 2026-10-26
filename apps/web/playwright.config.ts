import { randomBytes } from "node:crypto";
import { availableParallelism } from "node:os";
import { defineConfig, devices } from "@playwright/test";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";

loadRootEnvironmentFile();
// Browser tests must not inherit payment, mail or alert credentials from a developer's .env.
for (const key of [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_BUSINESS_PRICE_ID",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  "RESEND_API_KEY",
  "ALERT_WEBHOOK_URL",
  "MERCADO_LIVRE_CLIENT_ID",
  "MERCADO_LIVRE_CLIENT_SECRET",
]) {
  process.env[key] = "";
}
process.env.AUTO_FORWARD_ENABLED = "false";

process.env.E2E_MARKETPLACE_SECRET ??= randomBytes(32).toString("hex");

/** Overridable so a second checkout (a parallel worktree) runs its own servers side by side. */
const port = Number(process.env.E2E_PORT ?? 3100);
const workerHealthPort = Number(process.env.E2E_WORKER_HEALTH_PORT ?? 3101);
const appUrl = `http://localhost:${port}`;

/**
 * E2E queues live in their own Redis database, so a local `pnpm dev` worker
 * (with its own latency and state) never picks up jobs created by the tests.
 */
function isolatedRedisUrl(): string {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  url.pathname = `/${process.env.E2E_REDIS_DB ?? "1"}`;
  return url.toString();
}
const redisUrl = isolatedRedisUrl();

/**
 * Past 4 workers the Vite dev server is the bottleneck: every fresh browser context loads ~2,600
 * unbundled modules on its first page, and 8 workers starting at once pushed each one's first
 * sign-in past the 10s assertion timeout (7 to 10 specs failed together, passed alone). 4 workers
 * ran the same specs green in the same wall time. `--workers` still overrides it.
 */
const MAX_LOCAL_WORKERS = 4;

function localWorkers(): number {
  return Math.max(1, Math.min(MAX_LOCAL_WORKERS, Math.floor(availableParallelism() / 2)));
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // CI keeps Playwright's default (half the cores: 2 on the GitHub runner).
  ...(process.env.CI ? {} : { workers: localWorkers() }),
  timeout: 60_000,
  // The app runs on the Vite dev server, which compiles routes on first hit; with every worker
  // busy, a hydration or loader can pass the 5s default and fail a test that is fine.
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
    locale: "pt-BR",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `pnpm exec vite dev --config e2e/vite.config.ts --port ${port} --strictPort`,
      url: `${appUrl}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { APP_URL: appUrl, BETTER_AUTH_URL: appUrl, REDIS_URL: redisUrl },
    },
    {
      command: "pnpm --filter @sellbridge/worker exec tsx src/testing/start-e2e.ts",
      url: `http://localhost:${workerHealthPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        APP_URL: appUrl,
        REDIS_URL: redisUrl,
        WORKER_HEALTH_PORT: String(workerHealthPort),
      },
    },
  ],
});
