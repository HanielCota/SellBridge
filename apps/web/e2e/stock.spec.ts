import { expect, test, type Page } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { listings, listingTargets, member, user } from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { simulateSale } from "./sales";

/** The title of the listing `simulateSale` sells: the first published one. */
async function firstPublishedTitle(page: Page): Promise<string> {
  await gotoHydrated(page, "/publicacoes?status=published");
  const label = await page
    .getByRole("button", { name: /^Ações de / })
    .first()
    .getAttribute("aria-label");
  const title = label?.replace(/^Ações de /, "") ?? "";
  if (title === "") {
    throw new Error("Nenhum anúncio publicado na conta demo");
  }
  return title;
}

/** The demo store that sells `title`: the catalog shows only the supplier of the chosen store. */
async function storeSellingListing(title: string): Promise<string> {
  const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
  try {
    const [row] = await database
      .select({ storeId: listingTargets.storeConnectionId })
      .from(listingTargets)
      .innerJoin(listings, eq(listings.id, listingTargets.listingId))
      .innerJoin(member, eq(member.organizationId, listings.tenantId))
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(user.email, DEMO_USER.email),
          eq(listings.title, title),
          eq(listingTargets.status, "published"),
        ),
      )
      .limit(1);
    if (row === undefined) {
      throw new Error(`Nenhuma loja da demo vende "${title}"`);
    }
    return row.storeId;
  } finally {
    await database.$client.end();
  }
}

/** Units the catalog card of `title` shows in `storeId`'s catalog; 0 when it reads "Esgotado". */
async function catalogStock(page: Page, title: string, storeId: string): Promise<number> {
  await gotoHydrated(page, `/catalogo?store=${storeId}&query=${encodeURIComponent(title)}`);
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .first();
  await expect(card).toBeVisible();
  const text = await card.innerText();
  const match = /(\d+) em estoque/.exec(text);
  return match ? Number(match[1]) : 0;
}

test("uma venda simulada reduz o estoque mostrado no catálogo", async ({ page }) => {
  await signIn(page, DEMO_USER);
  const title = await firstPublishedTitle(page);
  const storeId = await storeSellingListing(title);
  const before = await catalogStock(page, title, storeId);
  expect(before).toBeGreaterThan(0);

  await simulateSale(page);

  // The order arrives through the webhook and the worker, so the catalog catches up shortly.
  // Other specs may sell the same demo listing meanwhile: the count only has to go down.
  await expect
    .poll(async () => catalogStock(page, title, storeId), { timeout: 30_000, intervals: [1000] })
    .toBeLessThan(before);
});

test("o catálogo diz quando o fornecedor atualizou o estoque", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/catalogo?inStock=true");
  const firstCard = page.locator("article").first();
  await expect(firstCard.getByText(/em estoque/)).toBeVisible();
  await expect(firstCard.getByText(/^atualizado /)).toBeVisible();
});
