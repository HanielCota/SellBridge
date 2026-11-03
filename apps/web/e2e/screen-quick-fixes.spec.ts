import { expect, type Page, test } from "@playwright/test";
import { e2eDatabase } from "./database";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

/*
 * Regressions from the screen sweep of 03/11/2026: pages that scrolled sideways on a phone,
 * words broken in two, cut texts and controls that read as broken.
 */

const PHONE = { width: 375, height: 812 };
const database = e2eDatabase();
const accounts = supplierAccounts(database);

test.afterAll(async () => {
  await accounts.removeAll();
  await database.$client.end();
});

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

test("a narrow desktop card drops the sold-out sash too", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoHydrated(page, "/publicacoes");
  const card = page
    .locator("main article")
    .filter({ hasText: "Sem estoque no fornecedor" })
    .first();
  await expect(card).toBeVisible();

  // Four columns beside the menu make cards this narrow on a desktop.
  await card.evaluate((element) => {
    element.style.setProperty("width", "250px");
  });

  await expect(card.locator("span:visible", { hasText: /^Esgotado$/ })).toHaveCount(0);
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

test("on a phone the shipments list turns into cards that fit", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await page.setViewportSize(PHONE);
  await gotoHydrated(page, "/admin/envios");
  const cards = page.getByRole("list", { name: "Envios" });

  await expect(cards).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
  expect(await sidewaysScroll(page)).toBe(0);
});

test("the support performance page uses the usual title and fits its narrow bars", async ({
  page,
}) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await gotoHydrated(page, "/admin/chamados/metricas");
  const title = page.getByRole("heading", { name: "Desempenho do suporte", level: 1 });
  await expect(title).toBeVisible();

  expect(await title.evaluate((element) => getComputedStyle(element).fontSize)).toBe("24px");
  // Beside the menu this box is about 440px: ten bars read "25/1" and their "100%" touched.
  const bars = page.getByRole("figure", { name: /por período, com a meta$/ });
  const fit = await bars.evaluate((figure) => {
    const shown = [...figure.querySelectorAll<HTMLElement>("span.tabular-nums")].filter(
      (span) => span.offsetParent !== null,
    );
    return {
      width: figure.getBoundingClientRect().width,
      cut: shown.filter((span) => span.scrollWidth > span.clientWidth).length,
      dates: shown.filter((span) => span.title === "").length,
    };
  });
  expect(fit.width).toBeLessThan(576);
  expect(fit.cut).toBe(0);
  expect(fit.dates).toBe(5);
});

test("the supplier's order tabs fade at the edge that hides more tabs", async ({ page }) => {
  const email = await accounts.signUp(page, "Quick Fix Tabs Supplier");
  await giveTestBrand(database, email, "Quick Fix Tabs Supplier");
  await page.setViewportSize(PHONE);
  await gotoHydrated(page, "/fornecedor/painel/pedidos");
  const tabs = page.getByRole("group", { name: "Etapa dos pedidos" });
  await expect(tabs).toBeVisible();

  await expect
    .poll(() => tabs.evaluate((element) => getComputedStyle(element).maskImage))
    .toContain("linear-gradient");
});

test("the 404 page's way back stands out in dark mode", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sellbridge-theme", "dark"));
  await gotoHydrated(page, "/nao-existe");
  const button = page.getByRole("link", { name: "Voltar ao início" });
  await expect(button).toBeVisible();

  // Contrast between the button and the page: the outline button sat at about 1.1:1.
  const contrast = await button.evaluate((element) => {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (context === null) {
      throw new Error("No 2D canvas to read the colors");
    }
    const luminance = (color: string) => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
      const linear = [red, green, blue].map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
    };
    const buttonLight = luminance(getComputedStyle(element).backgroundColor);
    const pageLight = luminance(getComputedStyle(document.body).backgroundColor);
    return (Math.max(buttonLight, pageLight) + 0.05) / (Math.min(buttonLight, pageLight) + 0.05);
  });
  expect(contrast).toBeGreaterThan(3);
});
