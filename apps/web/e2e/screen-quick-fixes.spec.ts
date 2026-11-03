import { expect, type Page, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

/*
 * Regressions from the screen sweep of 03/11/2026: pages that scrolled sideways on a phone,
 * words broken in two, cut texts and controls that read as broken.
 */

const PHONE = { width: 375, height: 812 };

/** The month before today's, in Brazil, as the report's `mes` param ("2026-10"). */
function previousMonth(): string {
  const [year = "", month = ""] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-");
  const date = new Date(Date.UTC(Number(year), Number(month) - 2, 1));
  return date.toISOString().slice(0, 7);
}

async function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test("the monthly report table scrolls inside its card, not the whole phone page", async ({
  page,
}) => {
  await signIn(page, DEMO_USER);
  await page.setViewportSize(PHONE);
  // The month before: the current one may still have no orders (e.g. on day 1).
  await gotoHydrated(page, `/financeiro/relatorio?mes=${previousMonth()}`);
  await expect(page.getByRole("heading", { name: "Indicadores" })).toBeVisible();

  expect(await sidewaysScroll(page)).toBe(0);
});
