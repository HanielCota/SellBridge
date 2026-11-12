import { expect, test, type Page } from "@playwright/test";
import { fillBillingHolder, gotoHydrated, signUp } from "./helpers";

const HEADER_ACTION = "Registrar venda manual";

/**
 * Records where the header action is on the first frame it exists, before any later content
 * (a strip loaded after the paint) can move it. Runs in the browser.
 */
function watchFirstPaintTop(label: string): void {
  const record = () => {
    // Only once the link is laid out on screen, not merely in the parsed document.
    const box = Array.from(document.querySelectorAll("a"))
      .filter((link) => link.textContent.trim() === label)
      .map((link) => link.getBoundingClientRect())
      .find((rect) => rect.height > 0);
    if (box === undefined) {
      requestAnimationFrame(record);
      return;
    }
    document.documentElement.dataset.firstPaintTop = String(box.top + window.scrollY);
  };
  requestAnimationFrame(record);
}

async function expectHeaderActionStayedPut(page: Page): Promise<void> {
  await expect(page.getByRole("complementary", { name: "Configuração da conta" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  // Recorded on the next frame, which may come after the strip is already in the document.
  await expect(page.locator("html")).toHaveAttribute("data-first-paint-top", /\d/);
  const firstPaintTop = await page.locator("html").getAttribute("data-first-paint-top");
  const box = await page.getByRole("link", { name: HEADER_ACTION }).boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);

  expect(box).not.toBeNull();
  expect((box?.y ?? Number.NaN) + scrollY).toBeCloseTo(Number(firstPaintTop), 0);
}

// Seen in production: the setup strip loaded after the paint and pushed the page down, so a click
// on "Registrar venda manual" landed on "Escolher fornecedor".
test("the setup strip is on the first paint and does not push the page header down", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "Revendedora Faixa Fixa");
  await gotoHydrated(page, "/onboarding");
  await fillBillingHolder(page);
  await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();
  await page.addInitScript(watchFirstPaintTop, HEADER_ACTION);

  await page.goto("/pedidos");
  await expectHeaderActionStayedPut(page);
  await expect(page.getByRole("link", { name: "Escolher fornecedor" })).toBeVisible();

  // From a page without the strip, by the menu: no full load to carry the progress along.
  await gotoHydrated(page, "/dashboard");
  await page.evaluate(() => delete document.documentElement.dataset.firstPaintTop);
  await page.evaluate(watchFirstPaintTop, HEADER_ACTION);
  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Pedidos" })
    .click();
  await expectHeaderActionStayedPut(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expectHeaderActionStayedPut(page);
});
