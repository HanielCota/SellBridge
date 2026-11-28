import { expect, test, type Page } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

/*
 * Regression: changing a filter of /fornecedores dropped the cards and drew six empty skeleton
 * cards for a moment before the new results. The current cards must stay until the new ones come.
 */

const SKELETON = '[aria-label="Carregando fornecedores"]';

/** Marks the page if the loading skeleton is ever drawn, however briefly. */
async function watchForSkeleton(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    new MutationObserver(() => {
      if (document.querySelector(selector) !== null) {
        document.documentElement.dataset.skeletonSeen = "true";
      }
    }).observe(document.body, { childList: true, subtree: true });
  }, SKELETON);
}

async function expectSkeletonNeverShown(page: Page): Promise<void> {
  await expect(page.locator('html[data-skeleton-seen="true"]')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/fornecedores");
  await expect(page.getByRole("link", { name: "Rio Pet Atacado" })).toBeVisible();
  await expect(page.locator(SKELETON)).toHaveCount(0);
  await watchForSkeleton(page);
});

test("trocar a ordem mantém os cartões na tela até chegarem os novos", async ({ page }) => {
  await page.getByLabel("Ordenar fornecedores").click();
  await page.getByRole("option", { name: "Melhor avaliados" }).click();

  await expect(page).toHaveURL(/sort=reputation/);
  await expect(page.locator('ul[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Rio Pet Atacado" })).toBeVisible();
  await expectSkeletonNeverShown(page);
});

test("filtrar pelo nicho mantém os cartões na tela até chegarem os novos", async ({ page }) => {
  // The niches past the first row wait behind the show-more toggle.
  await page.getByRole("button", { name: /^Mais \d+ nichos$/ }).click();
  await page.getByRole("button", { name: "Pet", exact: true }).click();

  await expect(page).toHaveURL(/niche=Pet/);
  await expect(page.getByRole("link", { name: "Ateliê Divinópolis Confecções" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Rio Pet Atacado" })).toBeVisible();
  await expectSkeletonNeverShown(page);
});
