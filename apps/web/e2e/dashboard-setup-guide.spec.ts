import { expect, test, type Page } from "@playwright/test";
import { gotoHydrated, signUp } from "./helpers";

const GUIDE_TITLE = "Falta pouco para sua primeira venda";

function setupGuide(page: Page) {
  return page.getByRole("region", { name: GUIDE_TITLE });
}

/**
 * How far the open guide's arrow sits from the card's top right corner, the larger of the two
 * gaps; infinite while the card or the arrow is not on screen.
 */
async function caretDistanceFromCorner(page: Page): Promise<number> {
  const card = await setupGuide(page).boundingBox();
  const caret = await setupGuide(page).getByTestId("setup-guide-caret").boundingBox();
  if (card === null || caret === null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(card.x + card.width - (caret.x + caret.width), caret.y - card.y);
}

/** The minimized guide: the same strip the other pages show. */
function setupStrip(page: Page) {
  return page.getByRole("complementary", { name: "Configuração da conta" });
}

test.describe("guia de configuração na visão geral", () => {
  test("conta nova vê o guia e os números da visão geral juntos", async ({ page }) => {
    await signUp(page, "Revendedora Visão Completa");

    await gotoHydrated(page, "/dashboard");

    await expect(setupGuide(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Visão geral", level: 1 })).toBeVisible();
    const reading = page.getByRole("region", { name: "Resumo do período" });
    await expect(reading.getByText("Nenhuma venda por enquanto.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Ver receita no financeiro" })).toBeVisible();
    await expect(page.getByText("Ainda sem vendas", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Precisa de você" })).toBeVisible();
  });

  test("esconde os passos pela seta do título, lembra depois de recarregar e mostra de novo", async ({
    page,
  }) => {
    await signUp(page, "Revendedora Guia Oculto");
    await gotoHydrated(page, "/dashboard");

    await setupGuide(page)
      .getByRole("button", { name: /Esconder os passos/ })
      .click();

    await expect(setupGuide(page)).toHaveCount(0);
    const maximize = setupStrip(page).getByRole("button", { name: /Mostrar os passos/ });
    await expect(maximize).toBeFocused();

    await gotoHydrated(page, "/dashboard");
    await expect(setupStrip(page)).toBeVisible();
    await expect(setupGuide(page)).toHaveCount(0);

    await maximize.click();

    await expect(setupGuide(page)).toBeVisible();
    await expect(
      setupGuide(page).getByRole("button", { name: /Esconder os passos/ }),
    ).toBeFocused();
    await gotoHydrated(page, "/dashboard");
    await expect(setupGuide(page)).toBeVisible();
    await expect(setupStrip(page)).toHaveCount(0);
  });

  test("a seta do guia aberto fica no canto de cima, à direita do cartão", async ({ page }) => {
    await signUp(page, "Revendedora Seta No Canto");

    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 860 });
      await gotoHydrated(page, "/dashboard");

      // boundingBox() does not wait, and the guide may render again right after loading: poll.
      await expect.poll(() => caretDistanceFromCorner(page)).toBeLessThanOrEqual(32);
    }
  });

  // The server cannot read the browser's choice: before hydration the page must already show the
  // strip, not the whole guide collapsing a moment later. Without the app's scripts the page
  // never hydrates, so what shows is the server's HTML and the inline script in the head.
  test("o guia minimizado vale antes de a página terminar de carregar", async ({ page }) => {
    await signUp(page, "Revendedora Sem Pulo");
    await gotoHydrated(page, "/dashboard");
    await setupGuide(page)
      .getByRole("button", { name: /Esconder os passos/ })
      .click();
    await expect(setupStrip(page)).toBeVisible();

    await page.route("**/*", (route) =>
      route.request().resourceType() === "script" ? route.abort() : route.continue(),
    );
    await page.goto("/dashboard", { waitUntil: "load" });

    await expect(page.getByRole("heading", { name: "Visão geral", level: 1 })).toBeVisible();
    await expect(setupStrip(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: GUIDE_TITLE })).toBeHidden();
  });
});
