import { expect, test, type Locator, type Page } from "@playwright/test";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer | undefined;
let cacheDirectory: string | undefined;
let fixtureUrl: string;

test.beforeAll(async () => {
  // Exercise the actual React/Radix components without depending on accounts or seed data.
  // The app's dev server runs concurrently; sharing its optimizer cache invalidates lazy imports.
  cacheDirectory = await mkdtemp(join(tmpdir(), "sellbridge-hint-"));
  server = await createServer({
    configFile: false,
    cacheDir: cacheDirectory,
    root: fileURLToPath(new URL("..", import.meta.url)),
    plugins: [tailwindcss(), react()],
    resolve: { tsconfigPaths: true },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === "string") {
    throw new Error("Missing tooltip fixture server address");
  }
  fixtureUrl = `http://127.0.0.1:${address.port}/e2e/fixtures/hint.html`;
});

test.afterAll(async () => {
  await server?.close();
  if (cacheDirectory !== undefined) {
    await rm(cacheDirectory, { recursive: true, force: true });
  }
});

async function swipeFrom(page: Page, trigger: Locator) {
  const box = await trigger.boundingBox();
  if (box === null) {
    throw new Error("Missing tooltip trigger bounds");
  }
  const session = await page.context().newCDPSession(page);
  const touchX = box.x + box.width / 2;
  const touchY = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    // oxlint-disable-next-line id-length -- CDP requires the coordinate keys x and y.
    touchPoints: [{ x: touchX, y: touchY }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    // oxlint-disable-next-line id-length -- CDP requires the coordinate keys x and y.
    touchPoints: [{ x: touchX, y: touchY - 50 }],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

test.describe("touch tooltips", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  for (const text of ["Test term", "Test button", "Passive term"]) {
    test(`the first tap opens ${text} and the second tap closes it`, async ({ page }) => {
      await page.goto(fixtureUrl);
      const trigger = page.getByText(text, { exact: true });
      await trigger.tap();
      await expect(page.getByRole("tooltip")).toBeVisible();
      await trigger.tap();
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await trigger.tap();
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.getByRole("button", { name: "Outside", exact: true }).tap();
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    });
  }

  test("a cancelled touch still allows outside dismissal and Escape", async ({ page }) => {
    await page.goto(fixtureUrl);
    const trigger = page.getByText("Test term", { exact: true });
    await trigger.focus();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await swipeFrom(page, trigger);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await trigger.tap();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.getByRole("button", { name: "Outside", exact: true }).tap();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await trigger.tap();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });
});

test("hover and keyboard focus still open tooltips", async ({ page }) => {
  await page.goto(fixtureUrl);
  const trigger = page.getByText("Test term", { exact: true });
  await trigger.hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.mouse.move(0, 0, { steps: 10 });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Test button", exact: true })).toBeFocused();
  await expect(page.getByRole("tooltip")).toBeVisible();
});

function readCssProperty(node: HTMLElement, name: string): string {
  return getComputedStyle(node).getPropertyValue(name);
}

for (const theme of ["light", "dark"] as const) {
  test(`checkbox selection styles survive tooltip composition in ${theme} mode`, async ({
    page,
  }) => {
    await page.goto(`${fixtureUrl}?theme=${theme}`);
    const plain = page.getByRole("checkbox", { name: "Plain selection", exact: true });
    const hinted = page.getByRole("checkbox", { name: "Hinted selection", exact: true });
    const outside = page.getByRole("button", { name: "Outside", exact: true });

    const expectMatchingStyles = async () => {
      for (const property of ["background-color", "border-top-color", "color"]) {
        await expect
          .poll(
            async () => {
              const [expected, actual] = await Promise.all([
                plain.evaluate(readCssProperty, property),
                hinted.evaluate(readCssProperty, property),
              ]);
              return actual === expected;
            },
            { message: `Checkbox ${property} should match with and without a tooltip` },
          )
          .toBe(true);
      }
    };

    await expect(plain).toBeChecked();
    await expect(hinted).toBeChecked();
    await expectMatchingStyles();
    const selectedBackground = await plain.evaluate(readCssProperty, "background-color");

    await hinted.hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expectMatchingStyles();

    await hinted.click();
    await plain.click();
    await outside.click();
    await expect(hinted).not.toBeChecked();
    await expect(plain).not.toBeChecked();
    await expectMatchingStyles();
    await expect(plain).not.toHaveCSS("background-color", selectedBackground);

    await hinted.focus();
    await page.keyboard.press("Space");
    await plain.check();
    await outside.focus();
    await expect(hinted).toBeChecked();
    await expect(plain).toBeChecked();
    await expectMatchingStyles();
    await expect(hinted).toHaveCSS("background-color", selectedBackground);
  });
}
