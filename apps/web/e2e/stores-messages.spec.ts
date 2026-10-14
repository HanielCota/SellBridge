import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

test("the stores page never shows text taken from its URL", async ({ page }) => {
  await signIn(page, DEMO_USER);
  const bait = "Sua conta foi suspensa. Regularize em pague-aqui.example";
  await gotoHydrated(page, `/lojas?erro=${encodeURIComponent(bait)}`);
  await expect(page.getByRole("heading", { level: 1, name: "Lojas" })).toBeVisible();
  await expect(page.getByText(bait)).toHaveCount(0);
});

test("a connection error code shows the app's own message", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/lojas?erro=expired");
  await expect(
    page.getByText("A solicitação de conexão expirou. Tente conectar novamente."),
  ).toBeVisible();
});
