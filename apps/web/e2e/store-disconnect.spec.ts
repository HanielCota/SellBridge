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
import {
  completeOnboarding,
  DEMO_USER,
  gotoHydrated,
  labelContentMismatches,
  signIn,
  signUp,
  waitForHydration,
} from "./helpers";
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

/**
 * A listing live on the new store, as if the publish job had already run. `price` picks one that
 * pays the cost and every fee, or one a real above the cost, which the fees turn into a loss.
 */
async function publishedListingOn(
  email: string,
  shopName: string,
  price: "paying" | "losing" = "paying",
): Promise<string> {
  const [store] = await database
    .select({ tenantId: storeConnections.tenantId, storeId: storeConnections.id })
    .from(storeConnections)
    .innerJoin(member, eq(member.organizationId, storeConnections.tenantId))
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(user.email, email), eq(storeConnections.shopName, shopName)));
  const [product] = await database
    .select({ id: supplierProducts.id, costCents: supplierProducts.costCents })
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
      priceCents: price === "paying" ? product.costCents * 4 : product.costCents + 100,
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

test("the store menu shows Desconectar on a short laptop screen and explains how to switch accounts", async ({
  page,
}) => {
  // The demo store has the longest menu (health, supplier and support entries), as real stores do.
  await signIn(page, DEMO_USER);
  await page.setViewportSize({ width: 1280, height: 620 });

  await gotoHydrated(page, "/lojas");
  await expect(page.getByText("Vai conectar outra conta?")).toBeVisible();
  await page.getByRole("button", { name: "Opções de Ana Moda" }).click();
  const disconnect = page.getByRole("menuitem", { name: "Desconectar" });

  await expect(disconnect).toBeInViewport({ ratio: 1 });
  await disconnect.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Vai conectar outra conta?")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
});

/** Disconnects the store pausing its listings, then brings it back as the OAuth callback does. */
async function disconnectAndReconnect(page: Page, shopName: string) {
  await gotoHydrated(page, "/lojas");
  await page.getByRole("button", { name: `Opções de ${shopName}` }).click();
  await page.getByRole("menuitem", { name: "Desconectar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Desconectar" }).click();
  await expect(
    page.getByText("1 anúncio pausado no marketplace (estoque zero).").filter({ visible: true }),
  ).toBeVisible();
  // What the OAuth callback does for the same shop (the simulated store makes a new shop on
  // every consent): the store connected again, then the stores page with `conectada`.
  const [store] = await database
    .update(storeConnections)
    .set({ status: "connected", accessTokenEnc: "reconnected", refreshTokenEnc: null })
    .where(eq(storeConnections.shopName, shopName))
    .returning({ id: storeConnections.id });
  await gotoHydrated(page, `/lojas?conectada=${store?.id ?? ""}`);
}

async function targetState(targetId: string) {
  const [target] = await database
    .select({ status: listingTargets.status, pauseReason: listingTargets.pauseReason })
    .from(listingTargets)
    .where(eq(listingTargets.id, targetId));
  return target;
}

const RESUME_OPTION = "Reativar o anúncio que foi pausado quando a loja foi desconectada";

test("reconnecting asks to reactivate what the disconnection paused, checked by default", async ({
  page,
}) => {
  const email = await signUp(page, "Revendedora Reconexão");
  await completeOnboarding(page, SUPPLIER);
  const shopName = `Loja reconexão ${Date.now()}`;
  await connectMockStore(page, shopName);
  const targetId = await publishedListingOn(email, shopName);

  await disconnectAndReconnect(page, shopName);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Loja "${shopName}" conectada` })).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: RESUME_OPTION })).toBeChecked();
  await dialog.getByRole("button", { name: "Reativar o anúncio" }).click();

  await expect(
    page.getByText("1 anúncio voltou a vender.").filter({ visible: true }),
  ).toBeVisible();
  expect(await targetState(targetId)).toEqual({ status: "published", pauseReason: null });
});

// Regression: a reconnected store kept the listings its disconnection paused at zero stock, and
// nothing told the reseller, who reconnected again and again while they sold nothing.
test("reconnecting without reactivating keeps the listings paused and says where to resume", async ({
  page,
}) => {
  const email = await signUp(page, "Revendedora Reconexão Pausa");
  await completeOnboarding(page, SUPPLIER);
  const shopName = `Loja reconexão pausa ${Date.now()}`;
  await connectMockStore(page, shopName);
  const targetId = await publishedListingOn(email, shopName);

  await disconnectAndReconnect(page, shopName);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: RESUME_OPTION }).uncheck();
  await dialog.getByRole("button", { name: "Manter pausado" }).click();

  await expect(
    page.getByText("Reative quando quiser em Publicações.").filter({ visible: true }),
  ).toBeVisible();
  expect(await labelContentMismatches(page)).toEqual([]);
  await expect(
    page.getByRole("link", { name: `${shopName}: 1 anúncio pausado · reative em Publicações` }),
  ).toBeVisible();
  expect(await targetState(targetId)).toEqual({
    status: "paused",
    pauseReason: "store_disconnected",
  });
});

test("reconnecting keeps paused, with the reason, a listing that would lose money", async ({
  page,
}) => {
  const email = await signUp(page, "Revendedora Reconexão Prejuízo");
  await completeOnboarding(page, SUPPLIER);
  const shopName = `Loja reconexão prejuízo ${Date.now()}`;
  await connectMockStore(page, shopName);
  const targetId = await publishedListingOn(email, shopName, "losing");

  await disconnectAndReconnect(page, shopName);
  await page.getByRole("dialog").getByRole("button", { name: "Reativar o anúncio" }).click();

  await expect(
    page
      .getByText("1 anúncio continua pausado: o preço não cobre o custo e as taxas.", {
        exact: false,
      })
      .filter({ visible: true }),
  ).toBeVisible();
  expect(await targetState(targetId)).toEqual({
    status: "paused",
    pauseReason: "price_below_floor",
  });
  await gotoHydrated(page, "/publicacoes?status=paused");
  await expect(
    page
      .getByText("Pausado porque o preço não cobre o custo e as taxas.", { exact: false })
      .filter({ visible: true }),
  ).toBeVisible();
});
