import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const NOTICE = { name: "Atualizar para a nova versão do SellBridge" } as const;

test("sem versão nova, o topo não mostra aviso", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/publicacoes");

  // The page asked the real server, which runs the page's own build.
  await expect(page.getByRole("heading", { name: "Publicações" })).toBeVisible();
  await expect(page.getByRole("button", NOTICE)).toHaveCount(0);
});

test("com versão nova no servidor, o topo avisa e só recarrega quando a pessoa clica", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.route("**/api/version", (route) =>
    route.fulfill({ json: { buildId: "versao-nova-e2e" } }),
  );
  await gotoHydrated(page, "/publicacoes");

  const notice = page.getByRole("button", NOTICE);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Nova versão do SellBridge");
  // Nothing reloads by itself: a marker left on the page survives until the click.
  await page.evaluate(() => {
    Object.assign(window, { versionNoticeMarker: true });
  });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => "versionNoticeMarker" in window)).toBe(true);

  await notice.click();
  await page.waitForLoadState("load");
  await expect.poll(async () => page.evaluate(() => "versionNoticeMarker" in window)).toBe(false);
});
