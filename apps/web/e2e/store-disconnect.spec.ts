import { expect, type Page, test } from "@playwright/test";
import { createListingWithTargets } from "@sellbridge/database/repositories";
import {
  listingTargets,
  member,
  storeConnections,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { completeOnboarding, gotoHydrated, signUp, waitForHydration } from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();
const SUPPLIER = "BH Beauty Distribuidora";

test.afterAll(async () => {
  await database.$client.end();
});

async function connectMockStore(page: Page, shopName: string) {
  await gotoHydrated(page, "/lojas");
  await page.getByRole("link", { name: "Conectar Mercado Livre" }).click();
  await expect(page.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill(shopName);
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(page).toHaveURL(/\/lojas/);
  await expect(page.getByText(shopName, { exact: true }).filter({ visible: true })).toBeVisible();
}

/** A listing live on the new store, as if the publish job had already run. */
async function publishedListingOn(email: string, shopName: string): Promise<string> {
  const [store] = await database
    .select({ tenantId: storeConnections.tenantId, storeId: storeConnections.id })
    .from(storeConnections)
    .innerJoin(member, eq(member.organizationId, storeConnections.tenantId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(user.email, email), eq(storeConnections.shopName, shopName)));
  const [product] = await database
    .select({ id: supplierProducts.id })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(eq(suppliers.name, SUPPLIER))
    .limit(1);
  if (store === undefined || product === undefined) {
    throw new Error("Loja ou produto do fornecedor ausente no banco de teste");
  }
  const created = await createListingWithTargets(
    database,
    store.tenantId,
    {
      supplierProductId: product.id,
      title: "Anúncio desconexão",
      description: "",
      priceCents: 4990,
    },
    [store.storeId],
  );
  const [targetId] = created.targetIds;
  if (targetId === undefined) {
    throw new Error("Anúncio de teste não foi criado");
  }
  await database
    .update(listingTargets)
    .set({ status: "published", externalId: `MOCK-OFF-${Date.now()}` })
    .where(eq(listingTargets.id, targetId));
  return targetId;
}

test("disconnecting pauses the store's live listings on the marketplace by default", async ({
  page,
}) => {
  const email = await signUp(page, "Revendedora Desconexão");
  await completeOnboarding(page, SUPPLIER);
  const shopName = `Loja pausa ${Date.now()}`;
  await connectMockStore(page, shopName);
  const targetId = await publishedListingOn(email, shopName);

  await gotoHydrated(page, "/lojas");
  await page.getByRole("button", { name: `Opções de ${shopName}` }).click();
  await page.getByRole("menuitem", { name: "Desconectar" }).click();
  const dialog = page.getByRole("dialog");
  const pauseOption = dialog.getByRole("checkbox", {
    name: "Pausar os anúncios desta loja no marketplace",
  });
  await expect(pauseOption).toBeChecked();
  await dialog.screenshot({ path: test.info().outputPath("disconnect-dialog.png") });
  await dialog.getByRole("button", { name: "Desconectar" }).click();

  await expect(
    page.getByText("1 anúncio pausado no marketplace (estoque zero).").filter({ visible: true }),
  ).toBeVisible();
  const [target] = await database
    .select({ status: listingTargets.status, syncedStock: listingTargets.syncedStock })
    .from(listingTargets)
    .where(eq(listingTargets.id, targetId));
  expect(target).toEqual({ status: "paused", syncedStock: 0 });
});
