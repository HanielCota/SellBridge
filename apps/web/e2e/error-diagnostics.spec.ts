import { expect, test } from "@playwright/test";
import { DEMO_USER, signIn } from "./helpers";
import { SESSION_REUSE_TIME_IN_MS } from "../src/features/auth/session.queries";
import { errorReportSchema } from "../src/lib/error-diagnostics";

test("records a route failure automatically and keeps page retry usable", async ({ page }) => {
  await page.clock.install();
  await signIn(page, DEMO_USER);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  // The tab reuses the signed-in session for a while; past that, the next navigation asks the
  // server again before the page, and that ask is the one that fails below.
  await page.clock.fastForward(SESSION_REUSE_TIME_IN_MS + 1000);
  await page.route("**/_serverFn/**", async (route) => {
    await route.abort("failed");
  });
  const delivery = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/diagnostics/errors") && response.request().method() === "POST",
  );
  await page.getByRole("link", { name: "Lojas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Esta página não abriu" })).toBeVisible();
  const response = await delivery;
  expect(response.status()).toBe(204);
  const report = errorReportSchema.parse(response.request().postDataJSON());
  expect(report.route).toBe("/_app/lojas");
  expect(report.buildId).toBeTruthy();
  await expect(
    page.getByText(`Se for falar com o Suporte, mande este código: ${report.id}`),
  ).toBeVisible();
  await page.unroute("**/_serverFn/**");
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByRole("heading", { name: "Lojas", exact: true })).toBeVisible();
});
