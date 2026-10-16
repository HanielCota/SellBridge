import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

/*
 * Regression: changing a filter of the statement navigated with the default scroll reset, so
 * the page jumped back to the top while the reseller was reading the statement below the chart.
 */
test("trocar o filtro do extrato mantém a rolagem da página", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/financeiro?period=90d");

  const filters = page.getByRole("group", { name: "Filtrar por etapa do pedido" });
  await filters.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  const scrolledTo = await page.evaluate(() => window.scrollY);

  await filters.getByRole("button", { name: "Cancelados e devolvidos" }).click();
  await expect(page).toHaveURL(/stage=issue/);
  await expect(filters.getByRole("button", { name: "Cancelados e devolvidos" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The list below may shrink; the page must not be sent back to the top.
  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(Math.min(scrolledTo, 300) - 1);
});
