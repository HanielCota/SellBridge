import { expect, test, type Page } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { simulateSale } from "./sales";

/** The title of the listing `simulateSale` sells: the first published one. */
async function firstPublishedTitle(page: Page): Promise<string> {
  await gotoHydrated(page, "/publicacoes?status=published");
  const label = await page
    .getByRole("button", { name: /^Ações de / })
    .first()
    .getAttribute("aria-label");
  const title = label?.replace(/^Ações de /, "") ?? "";
  if (title === "") {
    throw new Error("Nenhum anúncio publicado na conta demo");
  }
  return title;
}

/** Units the catalog card of `title` shows; 0 when it reads "Esgotado". */
async function catalogStock(page: Page, title: string): Promise<number> {
  await gotoHydrated(page, `/catalogo?query=${encodeURIComponent(title)}`);
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .first();
  await expect(card).toBeVisible();
  const text = await card.innerText();
  const match = /(\d+) em estoque/.exec(text);
  return match ? Number(match[1]) : 0;
}

test("uma venda simulada reduz o estoque mostrado no catálogo", async ({ page }) => {
  await signIn(page, DEMO_USER);
  const title = await firstPublishedTitle(page);
  const before = await catalogStock(page, title);
  expect(before).toBeGreaterThan(0);

  await simulateSale(page);

  // The order arrives through the webhook and the worker, so the catalog catches up shortly.
  // Other specs may sell the same demo listing meanwhile: the count only has to go down.
  await expect
    .poll(async () => catalogStock(page, title), { timeout: 30_000, intervals: [1000] })
    .toBeLessThan(before);
});

test("o catálogo diz quando o fornecedor atualizou o estoque", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/catalogo?inStock=true");
  const firstCard = page.locator("article").first();
  await expect(firstCard.getByText(/em estoque/)).toBeVisible();
  await expect(firstCard.getByText(/^atualizado /)).toBeVisible();
});
