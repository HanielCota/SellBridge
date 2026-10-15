import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database";
import { createListingWithTargets, markTargetPublished } from "@sellbridge/database/repositories";
import {
  listings,
  member,
  storeConnections,
  supplierCoverage,
  supplierProducts,
  suppliers,
  tenantProfile,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";
import { requireEnvironmentVariable } from "./environment";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const stamp = Date.now();
const supplierName = `Fornecedor desativado E2E ${stamp}`;
const productTitle = `Luminária desativada ${stamp}`;
let supplierId = "";
let productId = "";

/** The demo reseller's tenant, region and first connected store. */
async function demoSeller() {
  const [row] = await database
    .select({
      tenantId: member.organizationId,
      storeId: storeConnections.id,
      state: tenantProfile.state,
    })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(storeConnections, eq(storeConnections.tenantId, member.organizationId))
    .innerJoin(tenantProfile, eq(tenantProfile.tenantId, member.organizationId))
    .where(eq(user.email, DEMO_USER.email))
    .limit(1);
  if (row === undefined || row.state === null) {
    throw new Error("Conta demo sem loja ou sem região no banco de teste");
  }
  return { ...row, state: row.state };
}

test.beforeAll(async () => {
  const seller = await demoSeller();
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: supplierName, niche: "Casa", state: seller.state, city: "Teste" })
    .returning();
  if (!supplier) {
    throw new Error("fornecedor não criado");
  }
  supplierId = supplier.id;
  await database.insert(supplierCoverage).values({ supplierId, state: seller.state, city: null });
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
  const created = await createListingWithTargets(
    database,
    seller.tenantId,
    {
      supplierProductId: productId,
      title: productTitle,
      description: "Descrição",
      priceCents: 4990,
    },
    [seller.storeId],
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
  await database.delete(listings).where(eq(listings.supplierProductId, productId));
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
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
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(
    reseller,
    `/publicacoes?status=paused&query=${encodeURIComponent(productTitle)}`,
  );
  const card = reseller
    .locator("article")
    .filter({ has: reseller.getByText(productTitle, { exact: true }) })
    // While the route settles the list can render twice for a moment.
    .first();
  await expect(card.getByText("Produto fora do catálogo")).toBeVisible();

  await reseller.getByRole("button", { name: /^Avisos/ }).click();
  await expect(reseller.getByText(`Anúncio pausado: ${productTitle}`)).toBeVisible();
  await reseller.keyboard.press("Escape");

  // The card menu offers no "Reativar" while the supplier keeps the product off.
  await card.getByRole("button", { name: `Ações de ${productTitle}` }).click();
  await expect(reseller.getByRole("menuitem", { name: /Indisponível/ })).toBeDisabled();
  await expect(reseller.getByRole("menuitem", { name: "Reativar" })).toHaveCount(0);
  await reseller.close();
});
