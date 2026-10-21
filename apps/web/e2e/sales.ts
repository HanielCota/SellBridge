import { expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers";

/**
 * Sends a simulated sale from the first published listing, like the reseller would. The order
 * arrives through the webhook and the worker, so callers wait for it with `toPass`.
 */
export async function simulateSale(page: Page): Promise<void> {
  await gotoHydrated(page, "/publicacoes?status=published");
  await page
    .getByRole("button", { name: /^Ações de / })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Simular venda" }).click();
  await expect(
    page
      .getByText("Venda simulada enviada. Ela aparece no financeiro em instantes.")
      .filter({ visible: true }),
  ).toBeVisible();
}
