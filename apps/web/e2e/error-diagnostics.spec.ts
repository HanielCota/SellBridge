import { expect, test } from "@playwright/test";
import { DEMO_USER, signIn } from "./helpers";
import { errorReportSchema } from "../src/lib/error-diagnostics";

test("records a route failure automatically and keeps page retry usable", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await expect(page.getByRole("heading", { name: "Painel de vendas" })).toBeVisible();
  await page.route("**/_serverFn/**", async (route) => {
    await route.abort("failed");
  });
  const delivery = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/diagnostics/errors") && response.request().method() === "POST",
  );
  await page.getByRole("link", { name: "Lojas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Algo deu errado" })).toBeVisible();
  const response = await delivery;
  expect(response.status()).toBe(204);
  const report = errorReportSchema.parse(response.request().postDataJSON());
  expect(report.route).toBe("/_app/lojas");
  expect(report.buildId).toBeTruthy();
  await expect(page.getByText(`Erro registrado. Referência: ${report.id}`)).toBeVisible();
  await page.unroute("**/_serverFn/**");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("heading", { name: "Lojas", exact: true })).toBeVisible();
});
