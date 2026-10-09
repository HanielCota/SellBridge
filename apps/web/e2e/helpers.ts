import type { Page } from "@playwright/test";

/** Navigates and waits until the client bundle has loaded so React handlers are attached. */
export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });
}
