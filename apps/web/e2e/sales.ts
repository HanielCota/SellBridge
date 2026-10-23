import { expect, type Page } from "@playwright/test";
import { gotoHydrated } from "./helpers";

/**
 * Sends a simulated sale, like the reseller would: of the listing titled `title`, or of the first
 * published one. The order arrives through the webhook and the worker, so callers wait for it
 * with `toPass`.
 */
export async function simulateSale(page: Page, title?: string): Promise<void> {
  const query = title === undefined ? "" : `&query=${encodeURIComponent(title)}`;
  await gotoHydrated(page, `/publicacoes?status=published${query}`);
  const actions =
    title === undefined
      ? page.getByRole("button", { name: /^Ações de / })
      : page.getByRole("button", { name: `Ações de ${title}`, exact: true });
  await actions.first().click();
  await page.getByRole("menuitem", { name: "Simular venda" }).click();
  await expect(
    page
      .getByText("Venda simulada enviada. Ela aparece no financeiro em instantes.")
      .filter({ visible: true }),
  ).toBeVisible();
}
