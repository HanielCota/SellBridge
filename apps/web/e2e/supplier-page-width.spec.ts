import { expect, type Page, test } from "@playwright/test";
import { gotoHydrated } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const ALLOWED_DRIFT_IN_PX = 4;

test.afterAll(async () => {
  await accounts.removeAll();
  await database.$client.end({ timeout: 5 });
});

async function titleLeftEdge(page: Page, title: string): Promise<number> {
  const box = await page.getByRole("heading", { name: title, level: 1 }).boundingBox();
  if (box === null) {
    throw new Error(`Título sem caixa na tela: ${title}`);
  }
  return box.x;
}

/** Right edge of the main area's content box, where a full-width card ends. */
async function mainContentRightEdge(page: Page): Promise<number> {
  return page.locator("#main-content").evaluate((main) => {
    const box = main.getBoundingClientRect();
    return box.right - Number.parseFloat(getComputedStyle(main).paddingRight);
  });
}

test("regras de ouro usa a mesma largura das outras páginas do painel", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const email = await accounts.signUp(page, "Ateliê Largura Regras");
  await giveTestBrand(database, email, `Ateliê Largura Regras ${Date.now()}`);

  await gotoHydrated(page, "/fornecedor/painel/desempenho");
  const performanceLeft = await titleLeftEdge(page, "Desempenho");
  await gotoHydrated(page, "/fornecedor/painel/regras");
  const rulesLeft = await titleLeftEdge(page, "Regras de ouro");
  const rulesCard = await page.getByRole("region", { name: "As 5 regras" }).boundingBox();
  const contentRight = await mainContentRightEdge(page);

  expect(Math.abs(rulesLeft - performanceLeft)).toBeLessThanOrEqual(ALLOWED_DRIFT_IN_PX);
  expect(rulesCard).not.toBeNull();
  const cardRight = (rulesCard?.x ?? 0) + (rulesCard?.width ?? 0);
  expect(Math.abs(cardRight - contentRight)).toBeLessThanOrEqual(ALLOWED_DRIFT_IN_PX);
});
