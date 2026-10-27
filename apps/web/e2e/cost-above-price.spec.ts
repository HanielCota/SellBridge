import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createListingWithTargets,
  markTargetPublished,
  upsertStoreConnection,
} from "@sellbridge/database/repositories";
import {
  listings,
  member,
  organization,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { SIGN_UP_PASSWORD, gotoHydrated, signIn, signUp } from "./helpers";
import { testStoreInput } from "../../../packages/database/src/testing/fixtures";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
const stamp = Date.now();
const productTitle = `Abajur custo novo ${stamp}`;
let supplierId = "";
let productId = "";
let tenantId = "";
let customerEmail = "";

test.beforeAll(async ({ browser }) => {
  const customer = await browser.newPage();
  customerEmail = await signUp(customer, "Cost Above Price Customer");
  await customer.close();
  const [seller] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, customerEmail))
    .limit(1);
  if (seller === undefined) throw new Error("Customer tenant was not created");
  tenantId = seller.tenantId;
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: `Fornecedor custo E2E ${stamp}`, niche: "Casa", state: "SP", city: "Teste" })
    .returning();
  if (!supplier) throw new Error("fornecedor não criado");
  supplierId = supplier.id;
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `CUS-${stamp}`,
      title: productTitle,
      costCents: 2000,
      suggestedPriceCents: 4990,
      stock: 8,
    })
    .returning();
  if (!product) throw new Error("produto não criado");
  productId = product.id;
  const store = await upsertStoreConnection(database, {
    ...testStoreInput(tenantId, randomUUID()),
    supplierId,
  });
  const created = await createListingWithTargets(
    database,
    tenantId,
    {
      supplierProductId: productId,
      title: productTitle,
      description: "Descrição",
      priceCents: 4990,
    },
    [store.id],
  );
  const [targetId] = created.targetIds;
  if (!targetId) throw new Error("destino não criado");
  await markTargetPublished(database, targetId, {
    externalId: `E2E-CUS-${stamp}`,
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

test("o fornecedor sobe o custo acima do preço e o revendedor vê o anúncio pausado e o aviso", async ({
  page,
}) => {
  // The supplier's new cost (R$ 60,00) passes the listing's price (R$ 49,90).
  await database
    .update(supplierProducts)
    .set({ costCents: 6000 })
    .where(eq(supplierProducts.id, productId));

  await signIn(page, { email: customerEmail, password: SIGN_UP_PASSWORD });
  // It sells nothing, so it is listed under "Pausadas" and its card says so in one word.
  await gotoHydrated(page, `/publicacoes?status=paused&query=${encodeURIComponent(productTitle)}`);
  const card = page
    .locator("article")
    .filter({ has: page.getByText(productTitle, { exact: true }) })
    .first();
  await expect(card.getByText("Custo acima do preço")).toBeVisible();
  await expect(card.getByRole("button", { name: `Ações de ${productTitle}` })).toContainText(
    "Pausado",
  );

  await page.getByRole("button", { name: /^Avisos/ }).click();
  await expect(page.getByText(`Anúncio pausado: ${productTitle}`)).toBeVisible();
  await expect(page.getByText("Custo subiu. Aumente o preço para vender.")).toBeVisible();
  await page.keyboard.press("Escape");

  // The fix sits under the reason, not only in the card's menu.
  await card.getByRole("button", { name: "Ajustar preço" }).click();
  await expect(page.getByRole("dialog", { name: "Editar preço" })).toBeVisible();
});
