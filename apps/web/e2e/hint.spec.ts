import { expect, test, type Locator, type Page } from "@playwright/test";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer | undefined;
let fixtureUrl: string;

test.beforeAll(async () => {
  // Exercise the actual React/Radix components without depending on accounts or seed data.
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    plugins: [react()],
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
