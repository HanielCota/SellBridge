import { expect, test } from "@playwright/test";
import { supplierProducts } from "@sellbridge/database/schema";
import { e2eDatabase } from "./database";
import { ADMIN_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const stamp = Date.now();
const title = `Vaso com foto ${stamp}`;
// A photo the page can load offline; supplier photos live on other servers.
const PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%2322c55e'/%3E%3C/svg%3E";

test.afterAll(async () => {
  await accounts.removeAll();
});

/*
 * The product lists showed no photo at all: the team's Gestão de produtos cards and the
 * supplier's own list only had names and codes, so similar products were hard to tell apart.
 */
test("as listas de produtos mostram a foto de capa ao lado do nome", async ({ page, browser }) => {
  const email = await accounts.signUp(page, `Fornecedor fotos ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Marca fotos ${stamp}`);
  await database.insert(supplierProducts).values({
    supplierId,
    sku: `FOTO-${stamp}`,
    title,
    description: "Vaso de cerâmica para o teste das miniaturas",
    costCents: 2500,
    suggestedPriceCents: 4990,
    stock: 10,
    imageUrls: [PHOTO],
    reviewStatus: "approved",
  });

  await gotoHydrated(page, "/fornecedor/painel/produtos");
  const supplierRow = page.getByRole("row").filter({ hasText: title });
  await expect(supplierRow.locator(`img[src="${PHOTO}"]`)).toBeVisible();

  const admin = await browser.newPage();
  await signIn(admin, ADMIN_USER);
  await enableAdminMode(admin);
  await gotoHydrated(admin, `/admin/products?query=FOTO-${stamp}`);
  const card = admin.getByRole("listitem").filter({ hasText: title });
  await expect(card.locator(`img[src="${PHOTO}"]`)).toBeVisible();
  await admin.close();
});
