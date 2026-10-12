import { defineConfig, devices } from "@playwright/test";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
loadRootEnvironmentFile();
const appUrl = "http://localhost:3210";
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["fulfillment.spec.ts", "reviews.spec.ts"],
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: appUrl,
    ...devices["Desktop Chrome"],
    locale: "pt-BR",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec vite dev --port 3210 --strictPort",
    url: `${appUrl}/login`,
    timeout: 120000,
    env: { APP_URL: appUrl, BETTER_AUTH_URL: appUrl },
  },
});
