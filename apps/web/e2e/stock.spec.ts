import { expect, test, type Page } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { simulateSale } from "./sales";
import { ownSellableListing } from "./catalog-fixtures";
import { e2eDatabase } from "./database";

/** Units the catalog card of `title` shows in `storeId`'s catalog; 0 when it reads "Esgotado". */
async function catalogStock(page: Page, title: string, storeId: string): Promise<number> {
  await gotoHydrated(page, `/catalogo?store=${storeId}&query=${encodeURIComponent(title)}`);
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .first();
  await expect(card).toBeVisible();
  const text = await card.innerText();
  const match = /(\d+) em estoque/.exec(text);
  return match ? Number(match[1]) : 0;
}

const database = e2eDatabase();
let listing: Awaited<ReturnType<typeof ownSellableListing>> | undefined;

test.beforeAll(async () => {
  listing = await ownSellableListing(database, DEMO_USER.email);
});

test.afterAll(async () => {
  await listing?.remove();
  await database.$client.end();
});

test("uma venda simulada reduz o estoque mostrado no catálogo", async ({ page }) => {
  if (listing === undefined) throw new Error("anúncio de teste não criado");
  const { title, storeId } = listing;
  await signIn(page, DEMO_USER);
  const before = await catalogStock(page, title, storeId);
  expect(before).toBeGreaterThan(0);

  await simulateSale(page, title);

  // The order arrives through the webhook and the worker, so the catalog catches up shortly.
  await expect
    .poll(async () => catalogStock(page, title, storeId), { timeout: 30_000, intervals: [1000] })
    .toBeLessThan(before);
});

test("o catálogo diz quando o fornecedor atualizou o estoque", async ({ page }) => {
  if (listing === undefined) throw new Error("anúncio de teste não criado");
  const { title, storeId } = listing;
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/catalogo?store=${storeId}&query=${encodeURIComponent(title)}`);
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .first();
  await expect(card.getByText(/em estoque/)).toBeVisible();
  await expect(card.getByText(/^atualizado /)).toBeVisible();
});
