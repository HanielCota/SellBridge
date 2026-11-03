import { expect, type Page, test } from "@playwright/test";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";

/*
 * Regressions from the screen sweep of 03/11/2026: pages that scrolled sideways on a phone,
 * words broken in two, cut texts and controls that read as broken.
 */

const PHONE = { width: 375, height: 812 };

/** The month before today's, in Brazil, as the report's `mes` param ("2026-10"). */
function previousMonth(): string {
  const [year = "", month = ""] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 2, 1));
  return date.toISOString().slice(0, 7);
}

async function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** How many pixels a placeholder runs past its input's text box. */
async function placeholderOverflow(page: Page, placeholder: string): Promise<number> {
  return page.getByPlaceholder(placeholder).evaluate((input: HTMLInputElement) => {
    const style = getComputedStyle(input);
    const context = document.createElement("canvas").getContext("2d");
    if (context === null) {
      throw new Error("No 2D canvas to measure the placeholder");
    }
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const room =
      input.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    return context.measureText(input.placeholder).width - room;
  });
}

test("the monthly report table scrolls inside its card, not the whole phone page", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize(PHONE);
  // The month before: the current one may still have no orders (e.g. on day 1).
  await gotoHydrated(page, `/financeiro/relatorio?mes=${previousMonth()}`);
  await expect(page.getByRole("heading", { name: "Indicadores" })).toBeVisible();

  expect(await sidewaysScroll(page)).toBe(0);
});

test("on a phone the store figures keep their labels whole", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize(PHONE);
  await gotoHydrated(page, "/lojas");
  const label = page.locator("main dt", { hasText: /^Publicações$/ }).first();
  await expect(label).toBeVisible();

  // One line of text-xs: "Publicaçõe/s" made it two.
  const box = await label.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(20);
});

test("on a phone the sold-out sash steps aside instead of hiding under the state pill", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize(PHONE);
  await gotoHydrated(page, "/publicacoes");
  await expect(page.getByText("Sem estoque no fornecedor").first()).toBeVisible();

  const visibleSash = page.locator("main article span:visible", { hasText: /^Esgotado$/ });
  await expect(visibleSash).toHaveCount(0);
});

test("the new store's supplier name never breaks with a hyphen", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize(PHONE);
  await gotoHydrated(page, "/lojas");
  const name = page.getByText("Nenhum fornecedor escolhido");
  await expect(name).toBeVisible();

  // "forne-cedor": the browser hyphenated it in the narrow column.
  expect(await name.evaluate((element) => getComputedStyle(element).hyphens)).not.toBe("auto");
});

test("a supplier's product card keeps each price on one line on a small phone", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/fornecedores");
  await page.locator("main a[href^='/fornecedores/']").first().click();
  // The smallest phones in use: the narrowest cards, where "R$ 119,90" broke in two.
  await page.setViewportSize({ width: 320, height: 640 });
  const prices = page.locator("main dd").filter({ hasText: /^R\$/ });
  await expect(prices.first()).toBeVisible();

  const tallest = await prices.evaluateAll((elements) =>
    Math.max(...elements.map((element) => element.getBoundingClientRect().height)),
  );
  expect(tallest).toBeLessThan(28);
});

test("the suppliers list says 1 produto, never 1 produtos", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/fornecedores");
  await expect(page.getByText(/^\d+ produtos?$/).first()).toBeVisible();

  await expect(page.getByText("1 produtos", { exact: true })).toHaveCount(0);
});

test("the supplier search hint fits a phone", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize(PHONE);
  await gotoHydrated(page, "/fornecedores");

  expect(await placeholderOverflow(page, "Buscar nicho ou produto")).toBeLessThanOrEqual(0);
});

test("the ticket search hint fits a phone", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await enableAdminMode(page);
  await page.setViewportSize(PHONE);
  await gotoHydrated(page, "/admin/chamados");
  expect(await placeholderOverflow(page, "Assunto, revendedor ou e-mail")).toBeLessThanOrEqual(0);
});
