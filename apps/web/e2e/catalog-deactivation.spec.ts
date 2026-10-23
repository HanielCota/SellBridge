import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createListingWithTargets,
  markTargetPublished,
  upsertStoreConnection,
} from "@sellbridge/database/repositories";
import {
  listings,
  organization,
  member,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import {
  ADMIN_USER,
  SIGN_UP_PASSWORD,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
} from "./helpers";
import { testStoreInput } from "../../../packages/database/src/testing/fixtures";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
const stamp = Date.now();
const supplierName = `Fornecedor desativado E2E ${stamp}`;
const productTitle = `Luminária desativada ${stamp}`;
let supplierId = "";
let productId = "";
let tenantId = "";
let customerEmail = "";

/** A dedicated customer keeps publication state isolated from other browser tests. */
async function catalogSeller(email: string) {
  const [row] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);
  if (row === undefined) {
    throw new Error("Customer tenant was not created");
  }
  return row;
}

test.beforeAll(async ({ browser }) => {
  const customer = await browser.newPage();
  customerEmail = await signUp(customer, "Catalog Deactivation Customer");
  await customer.close();
  const seller = await catalogSeller(customerEmail);
  tenantId = seller.tenantId;
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: supplierName, niche: "Casa", state: "SP", city: "Teste" })
    .returning();
  if (!supplier) {
    throw new Error("fornecedor não criado");
  }
  supplierId = supplier.id;
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `DES-${stamp}`,
      title: productTitle,
      costCents: 2000,
      suggestedPriceCents: 4990,
      stock: 8,
    })
    .returning();
  if (!product) {
    throw new Error("produto não criado");
  }
  productId = product.id;
  const store = await upsertStoreConnection(database, {
    ...testStoreInput(tenantId, randomUUID()),
    supplierId,
  });
  const created = await createListingWithTargets(
    database,
    seller.tenantId,
    {
      supplierProductId: productId,
      title: productTitle,
      description: "Descrição",
      priceCents: 4990,
    },
    [store.id],
  );
  const [targetId] = created.targetIds;
  if (!targetId) {
    throw new Error("destino não criado");
  }
  await markTargetPublished(database, targetId, {
    externalId: `E2E-DES-${stamp}`,
    externalUrl: null,
  });
});

test.afterAll(async () => {
  if (productId) await database.delete(listings).where(eq(listings.supplierProductId, productId));
  if (tenantId) await database.delete(organization).where(eq(organization.id, tenantId));
  if (supplierId) await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  if (customerEmail) await database.delete(user).where(eq(user.email, customerEmail));
  await database.$client.end();
});

test("admin desativa um produto e o revendedor vê o anúncio pausado e o aviso", async ({
  browser,
  page,
}) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}`);
  const row = page.getByRole("row", { name: new RegExp(`DES-${stamp}`) });
  await row.getByRole("button", { name: "Desativar" }).click();
  await expect(page.getByText("1 anúncio pausado")).toBeVisible();

  const reseller = await browser.newPage();
  await signIn(reseller, { email: customerEmail, password: SIGN_UP_PASSWORD });
  await gotoHydrated(
    reseller,
    `/publicacoes?status=paused&query=${encodeURIComponent(productTitle)}`,
  );
  const card = reseller
    .locator("article")
    .filter({ has: reseller.getByText(productTitle, { exact: true }) })
    // While the route settles the list can render twice for a moment.
    .first();
  await expect(card.getByText("Produto indisponível")).toBeVisible();

  await reseller.getByRole("button", { name: /^Avisos/ }).click();
  await expect(reseller.getByText(`Anúncio pausado: ${productTitle}`)).toBeVisible();
  await reseller.keyboard.press("Escape");

  // The card menu offers no "Reativar" while the supplier keeps the product off.
  await card.getByRole("button", { name: `Ações de ${productTitle}` }).click();
  await expect(reseller.getByRole("menuitem", { name: /Indisponível/ })).toBeDisabled();
  await expect(reseller.getByRole("menuitem", { name: "Reativar" })).toHaveCount(0);
  await reseller.close();
});
