import { defineConfig, devices } from "@playwright/test";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";

loadRootEnvironmentFile();

const port = 3100;
const workerHealthPort = 3101;
const appUrl = `http://localhost:${port}`;

/**
 * E2E queues live in their own Redis database, so a local `pnpm dev` worker
 * (with its own latency and state) never picks up jobs created by the tests.
 */
function isolatedRedisUrl(): string {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  url.pathname = "/1";
  return url.toString();
}
const redisUrl = isolatedRedisUrl();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60_000,
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
      command: `pnpm exec vite dev --port ${port} --strictPort`,
      url: `${appUrl}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { APP_URL: appUrl, BETTER_AUTH_URL: appUrl, REDIS_URL: redisUrl },
    },
    {
      command: "pnpm --filter @sellbridge/worker start",
      url: `http://localhost:${workerHealthPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        APP_URL: appUrl,
        REDIS_URL: redisUrl,
        MOCK_LATENCY_MILLISECONDS: "150",
        WORKER_HEALTH_PORT: String(workerHealthPort),
      },
    },
  ],
});
