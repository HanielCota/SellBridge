import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const NOTICE = { name: "Atualizar para a nova versão do SellBridge" } as const;

/** A deploy made after the page's build. */
const NEWER_BUILD = { buildId: "versao-nova-e2e", builtAt: "2999-01-01T00:00:00.000Z" };

test("sem versão nova, o topo não mostra aviso", async ({ page }) => {
  await signIn(page, DEMO_USER);
  const versionAnswer = page.waitForResponse("**/api/version");
  await gotoHydrated(page, "/publicacoes");

  // The page asked the real server, which runs the page's own build, and got its answer.
  expect((await versionAnswer).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Publicações" })).toBeVisible();
  // A retrying "count is 0" would pass before React renders the answer: give it time, then look once.
  await page.waitForTimeout(1500);
  expect(await page.getByRole("button", NOTICE).count()).toBe(0);
});

test("com versão nova no servidor, o topo avisa e só recarrega quando a pessoa clica", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.route("**/api/version", (route) => route.fulfill({ json: NEWER_BUILD }));
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
