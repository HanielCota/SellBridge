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
  orderItems,
  orders,
  storeConnections,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { eq, inArray } from "drizzle-orm";
import { testStoreInput } from "../../../packages/database/src/testing/fixtures";
import { e2eDatabase } from "./database";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const database = e2eDatabase();
const stamp = randomUUID().slice(0, 8);
const PERMALINK = `https://produto.mercadolivre.com.br/MLB-${stamp}-bolsa-e2e-_JM`;
const OTHER_PERMALINK = `https://produto.mercadolivre.com.br/MLB-${stamp}-garrafa-e2e-_JM`;
const TITLES = {
  linked: `Bolsa com link E2E ${stamp}`,
  waiting: `Mochila sem link E2E ${stamp}`,
  twoStores: `Garrafa duas lojas E2E ${stamp}`,
};
const STORES = { first: `Loja Centro ${stamp}`, second: `Loja Bairro ${stamp}` };

let supplierId = "";
let orderId = "";
const storeIds: string[] = [];
const productIds: string[] = [];

async function demoTenant(): Promise<string> {
  const [account] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, DEMO_USER.email))
    .limit(1);
  if (account === undefined) {
    throw new Error(`Conta de teste sem perfil: ${DEMO_USER.email}`);
  }
  return account.tenantId;
}

async function mercadoLivreStore(tenantId: string, shopName: string): Promise<string> {
  const cipher = createTokenCipher(requireEnvironmentVariable("TOKEN_ENCRYPTION_KEY"));
  const store = await upsertStoreConnection(database, {
    ...testStoreInput(tenantId, `link-e2e-${shopName}`),
    shopName,
    marketplace: "mercado_livre",
    accessTokenEnc: cipher.encrypt("mock-access-token"),
    refreshTokenEnc: cipher.encrypt("mock-refresh-token"),
    supplierId,
  });
  storeIds.push(store.id);
  return store.id;
}

/** A product published on each store, with the link Mercado Livre gave there (or none yet). */
async function publishedListing(
  tenantId: string,
  title: string,
  stores: { storeId: string; url: string | null }[],
) {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `LINK-E2E-${randomUUID().slice(0, 8)}`,
      title,
      costCents: 2000,
      suggestedPriceCents: 4990,
      stock: 30,
    })
    .returning();
  if (product === undefined) {
    throw new Error("produto de teste não criado");
  }
  productIds.push(product.id);
  const created = await createListingWithTargets(
    database,
    tenantId,
    { supplierProductId: product.id, title, description: "Produto de teste", priceCents: 4990 },
    stores.map((store) => store.storeId),
  );
  for (const [index, targetId] of created.targetIds.entries()) {
    await markTargetPublished(database, targetId, {
      externalId: `MLB${index}${stamp}`,
      externalUrl: stores[index]?.url ?? null,
    });
  }
  return { productId: product.id, targetIds: created.targetIds };
}

test.beforeAll(async () => {
  const tenantId = await demoTenant();
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: `Fornecedor link E2E ${stamp}`, niche: "Moda", state: "SP", city: "Teste" })
    .returning();
  if (supplier === undefined) {
    throw new Error("fornecedor de teste não criado");
  }
  supplierId = supplier.id;
  const first = await mercadoLivreStore(tenantId, STORES.first);
  const second = await mercadoLivreStore(tenantId, STORES.second);
  const linked = await publishedListing(tenantId, TITLES.linked, [
    { storeId: first, url: PERMALINK },
  ]);
  await publishedListing(tenantId, TITLES.waiting, [{ storeId: first, url: null }]);
  await publishedListing(tenantId, TITLES.twoStores, [
    { storeId: first, url: OTHER_PERMALINK },
    { storeId: second, url: null },
  ]);
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: first,
      externalOrderId: `LINK-E2E-${stamp}`,
      status: "paid",
      totalCents: 4990,
      orderedAt: new Date(),
      paidAt: new Date(),
    })
    .returning();
  if (order === undefined) {
    throw new Error("pedido de teste não criado");
  }
  orderId = order.id;
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    listingTargetId: linked.targetIds[0],
    supplierProductId: linked.productId,
    title: TITLES.linked,
    quantity: 1,
    unitPriceCents: 4990,
    unitCostCents: 2000,
  });
});

test.afterAll(async () => {
  await database.delete(orders).where(inArray(orders.storeConnectionId, storeIds));
  await database.delete(listings).where(inArray(listings.supplierProductId, productIds));
  await database.delete(storeConnections).where(inArray(storeConnections.id, storeIds));
  await database.delete(supplierProducts).where(inArray(supplierProducts.id, productIds));
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

test.beforeEach(async ({ page }) => {
  await signIn(page, DEMO_USER);
});

test("opens the Mercado Livre ad in a new tab from the listing card", async ({ page }) => {
  await gotoHydrated(page, `/publicacoes?query=${encodeURIComponent(TITLES.linked)}`);

  const link = page.getByRole("link", { name: `Ver anúncio de ${TITLES.linked}` });

  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", PERMALINK);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("says when Mercado Livre has not sent the ad's link yet", async ({ page }) => {
  await gotoHydrated(page, `/publicacoes?query=${encodeURIComponent(TITLES.waiting)}`);

  const card = page.getByRole("article", { name: TITLES.waiting });

  await expect(card.getByRole("button", { name: "Ver anúncio" })).toBeDisabled();
  await expect(
    card.getByText("O Mercado Livre ainda não mandou o link deste anúncio."),
  ).toBeVisible();
});

test("asks which store's ad to open when the product is on two stores", async ({ page }) => {
  await gotoHydrated(page, `/publicacoes?query=${encodeURIComponent(TITLES.twoStores)}`);

  await page.getByRole("button", { name: `Ver anúncio de ${TITLES.twoStores}` }).click();

  const open = page.getByRole("menuitem", { name: STORES.first });
  await expect(open).toHaveAttribute("href", OTHER_PERMALINK);
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("menuitem", { name: new RegExp(STORES.second) })).toBeDisabled();
});

test("opens the ad an order was sold from", async ({ page }) => {
  await gotoHydrated(page, `/pedidos/${orderId}`);

  const link = page.getByRole("link", { name: `Ver anúncio de ${TITLES.linked}` });

  await expect(link).toHaveAttribute("href", PERMALINK);
  await expect(link).toHaveAttribute("target", "_blank");
});
