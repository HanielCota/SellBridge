import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
import { boxOf, boxesOverlap, expectSoldOutTagReadable } from "./sold-out-tag";

const database = e2eDatabase();
const stamp = Date.now();
// The color suffix draws the variant chip in the photo's other bottom corner.
const productTitle = `Blusa esgotada E2E ${stamp} - Verde`;
let supplierId = "";
let productId = "";
let tenantId = "";
let customerEmail = "";

async function soldOutCard(page: Page): Promise<Locator> {
  await gotoHydrated(page, `/publicacoes?query=${encodeURIComponent(productTitle)}`);
  const card = page
    .locator("article")
    .filter({ has: page.getByText(productTitle, { exact: true }) })
    // While the route settles the list can render twice for a moment.
    .first();
  await expect(card.getByText("Desativado", { exact: true })).toBeVisible();
  return card;
}

/** The "Esgotado" word sits whole inside the card, clear of the status button and the color chip. */
async function expectSoldOutReadable(card: Locator) {
  const soldOutBox = await expectSoldOutTagReadable(card);
  const colorChip = await boxOf(card.getByText("Verde", { exact: true }));

  expect(boxesOverlap(soldOutBox, colorChip)).toBe(false);
}

test.beforeAll(async ({ browser }) => {
  const customer = await browser.newPage();
  customerEmail = await signUp(customer, "Sold Out Badge Customer");
  await customer.close();
  const [account] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, customerEmail))
    .limit(1);
  if (account === undefined) {
    throw new Error("Customer tenant was not created");
  }
  tenantId = account.tenantId;
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: `Fornecedor esgotado E2E ${stamp}`, niche: "Moda", state: "MG", city: "Teste" })
    .returning();
  if (supplier === undefined) {
    throw new Error("Supplier was not created");
  }
  supplierId = supplier.id;
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `ESG-${stamp}`,
      title: productTitle,
      costCents: 3387,
      suggestedPriceCents: 7890,
      stock: 0,
    })
    .returning();
  if (product === undefined) {
    throw new Error("Product was not created");
  }
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
      priceCents: 7890,
    },
    [store.id],
  );
  const [targetId] = created.targetIds;
  if (targetId === undefined) {
    throw new Error("Listing target was not created");
  }
  await markTargetPublished(database, targetId, {
    externalId: `E2E-ESG-${stamp}`,
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

test("o aviso de esgotado aparece inteiro ao lado da situação no computador", async ({ page }) => {
  await signIn(page, { email: customerEmail, password: SIGN_UP_PASSWORD });

  const card = await soldOutCard(page);

  await expectSoldOutReadable(card);
});

test("o aviso de esgotado aparece inteiro ao lado da situação no celular", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, { email: customerEmail, password: SIGN_UP_PASSWORD });

  const card = await soldOutCard(page);

  await expectSoldOutReadable(card);
});
