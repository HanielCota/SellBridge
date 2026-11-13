import { expect, test, type Page } from "@playwright/test";
import { gotoHydrated, signUp } from "./helpers";

const GUIDE_TITLE = "Falta pouco para sua primeira venda";

function setupGuide(page: Page) {
  return page.getByRole("region", { name: GUIDE_TITLE });
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

  test("minimiza o guia, lembra depois de recarregar e maximiza de novo", async ({ page }) => {
    await signUp(page, "Revendedora Guia Oculto");
    await gotoHydrated(page, "/dashboard");

    await setupGuide(page).getByRole("button", { name: "Minimizar" }).click();

    await expect(setupGuide(page)).toHaveCount(0);
    const maximize = setupStrip(page).getByRole("button", { name: "Maximizar" });
    await expect(maximize).toBeFocused();

    await gotoHydrated(page, "/dashboard");
    await expect(setupStrip(page)).toBeVisible();
    await expect(setupGuide(page)).toHaveCount(0);

    await maximize.click();

    await expect(setupGuide(page)).toBeVisible();
    await expect(setupGuide(page).getByRole("button", { name: "Minimizar" })).toBeFocused();
    await gotoHydrated(page, "/dashboard");
    await expect(setupGuide(page)).toBeVisible();
    await expect(setupStrip(page)).toHaveCount(0);
  });

  // The server cannot read the browser's choice: before hydration the page must already show the
  // strip, not the whole guide collapsing a moment later. Without the app's scripts the page
  // never hydrates, so what shows is the server's HTML and the inline script in the head.
  test("o guia minimizado vale antes de a página terminar de carregar", async ({ page }) => {
    await signUp(page, "Revendedora Sem Pulo");
    await gotoHydrated(page, "/dashboard");
    await setupGuide(page).getByRole("button", { name: "Minimizar" }).click();
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
