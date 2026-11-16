import { expect, test, type Page } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn, waitForHydration } from "./helpers";

async function isDark(page: Page): Promise<boolean> {
  return await page.evaluate(() => document.documentElement.classList.contains("dark"));
}

function profileCard(page: Page) {
  return page.getByRole("button", { name: /Menu do usuário/ }).locator("visible=true");
}

function menuThemeSwitch(page: Page) {
  return page.getByRole("menuitemcheckbox", { name: "Tema escuro", exact: true });
}

test("the profile menu's theme switch flips by click and keyboard and survives a reload", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 1366, height: 900 });
  await gotoHydrated(page, "/dashboard");
  expect(await isDark(page), "dark is the default").toBe(true);
  await profileCard(page).click();
  const themeSwitch = menuThemeSwitch(page);
  await expect(themeSwitch).toHaveAttribute("aria-checked", "true");

  await themeSwitch.click();

  await expect.poll(() => isDark(page)).toBe(false);
  // The menu stays open, so the switch is seen moving to the sun.
  await expect(themeSwitch).toHaveAttribute("aria-checked", "false");
  await themeSwitch.focus();
  await page.keyboard.press("Space");
  await expect.poll(() => isDark(page)).toBe(true);
  await page.keyboard.press("Enter");
  await expect.poll(() => isDark(page)).toBe(false);
  await expect(themeSwitch).toBeVisible();

  await page.reload();
  await waitForHydration(page);
  expect(await isDark(page), "light kept after a reload").toBe(false);
  await profileCard(page).click();
  await expect(menuThemeSwitch(page)).toHaveAttribute("aria-checked", "false");
});

test("on a phone the drawer's theme switch is a 44 px target and flips the theme", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoHydrated(page, "/dashboard");
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await profileCard(page).click();
  const themeSwitch = menuThemeSwitch(page);
  // The menu zooms in as it opens; measure once it rests at full size.
  await page
    .getByRole("menu")
    .evaluate(
      async (menu) =>
        await Promise.all(menu.getAnimations().map((animation) => animation.finished)),
    );

  const box = await themeSwitch.boundingBox();
  await themeSwitch.click();

  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect.poll(() => isDark(page)).toBe(false);
  await expect(themeSwitch).toHaveAttribute("aria-checked", "false");
});

test("the sign-in page's theme switch flips by keyboard and survives a reload", async ({
  page,
}) => {
  await gotoHydrated(page, "/login");
  const themeSwitch = page.getByRole("switch", { name: "Tema escuro", exact: true });
  await expect(themeSwitch).toHaveAttribute("aria-checked", "true");
  expect((await themeSwitch.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  await themeSwitch.focus();
  await page.keyboard.press("Space");

  await expect.poll(() => isDark(page)).toBe(false);
  await expect(themeSwitch).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Enter");
  await expect.poll(() => isDark(page)).toBe(true);
  await themeSwitch.click();
  await expect.poll(() => isDark(page)).toBe(false);
  await page.reload();
  await waitForHydration(page);
  expect(await isDark(page)).toBe(false);
  await expect(page.getByRole("switch", { name: "Tema escuro" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});
