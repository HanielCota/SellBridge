import { expect, type Page, test } from "@playwright/test";
import {
  member,
  storeBuyerAddressChecks,
  storeConnections,
  storeSuppliers,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { and, eq, sql } from "drizzle-orm";
import { e2eDatabase } from "./database";
import {
  ADMIN_USER,
  completeOnboarding,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
  waitForHydration,
} from "./helpers";
import { STAND_IN_BUYS_AT_WAREHOUSE_PREFIX, STAND_IN_WAREHOUSE } from "./mercado-livre.fixture";

/*
 * A reseller whose Mercado Livre account buys at the supplier's warehouse: the stores page says
 * so, the dashboard asks to fix it, and once the account buys at home "Já arrumei, conferir de
 * novo" frees the store. The web server reads the accounts from the stand-in in
 * mercado-livre.fixture.ts (by account id), never from the real Mercado Livre.
 */
const database = e2eDatabase();
const supplierIds: string[] = [];

test.afterAll(async () => {
  for (const supplierId of supplierIds) {
    await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  }
  await database.$client.end();
});

async function sellerOf(email: string): Promise<{ tenantId: string; userId: string }> {
  const [seller] = await database
    .select({ tenantId: member.organizationId, userId: user.id })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);
  if (seller === undefined) {
    throw new Error("Conta nova sem organização no banco de teste");
  }
  return seller;
}

/** Signs a reseller up, connects one store and links it to a supplier at the warehouse. */
async function heldStoreSetup(page: Page, label: string) {
  const email = await signUp(page, `Revendedora ${label}`);
  await completeOnboarding(page);
  await expect(page).toHaveURL(/\/lojas/);
  const shopName = `Loja ${label} E2E ${Date.now()}`;
  await connectStore(page, shopName);
  const seller = await sellerOf(email);
  const [store] = await database
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(
      and(eq(storeConnections.tenantId, seller.tenantId), eq(storeConnections.shopName, shopName)),
    );
  if (store === undefined) {
    throw new Error("Loja conectada não encontrada");
  }
  const supplier = await createWarehouseSupplier();
  await database
    .insert(storeSuppliers)
    .values({ storeConnectionId: store.id, supplierId: supplier.id });
  return { seller, shopName, storeId: store.id, supplier };
}

/** A supplier whose NF-e address is the stand-in's warehouse. */
async function createWarehouseSupplier(): Promise<{ id: string; name: string }> {
  const name = `Distribuidora Endereço E2E ${Date.now()}`;
  const [created] = await database
    .insert(suppliers)
    .values({ name, niche: "Beleza", state: "MG", city: "Belo Horizonte" })
    .returning({ id: suppliers.id });
  if (created === undefined) {
    throw new Error("Fornecedor de teste não criado");
  }
  supplierIds.push(created.id);
  // Only the address matters to the check; the rest of the NF-e profile is left out.
  await database.execute(
    sql`update suppliers set fiscal_profile = ${JSON.stringify({ address: STAND_IN_WAREHOUSE })}::jsonb
      where id = ${created.id}`,
  );
  return { id: created.id, name };
}

async function connectStore(page: Page, shopName: string): Promise<void> {
  await page.getByRole("link", { name: "Conectar Mercado Livre" }).click();
  await expect(page.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill(shopName);
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(
    page.getByText(`Loja "${shopName}" conectada`).filter({ visible: true }),
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * The reseller changes the account on Mercado Livre a while later: the stand-in answers by
 * account id (one prefix buys at the warehouse, other numbers at home), and the last reading is
 * moved back past the few seconds in which a click reuses it.
 */
async function setAccount(storeId: string, buysAtWarehouse: boolean): Promise<void> {
  const prefix = buysAtWarehouse ? STAND_IN_BUYS_AT_WAREHOUSE_PREFIX : "7791";
  await database
    .update(storeConnections)
    .set({ externalShopId: `${prefix}${Date.now()}` })
    .where(eq(storeConnections.id, storeId));
  await database
    .update(storeBuyerAddressChecks)
    .set({ checkedAt: new Date(Date.now() - 60_000) })
    .where(eq(storeBuyerAddressChecks.storeConnectionId, storeId));
}

test("a store that buys at its supplier's address is held until the reseller fixes it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { shopName, storeId, supplier } = await heldStoreSetup(page, "Endereço");

  // The test consent gives the shop an id Mercado Livre would never use, so it was not read.
  await gotoHydrated(page, "/lojas");
  const card = page.getByRole("listitem").filter({ hasText: shopName });
  await expect(card.getByText("Endereço de compra não conferido")).toBeVisible();

  await setAccount(storeId, true);
  await card.getByRole("button", { name: "Conferir agora" }).click();
  await expect(card.getByText("Compras indo para o fornecedor")).toBeVisible();
  await expect(card.getByText(`vão chegar em ${supplier.name}`)).toBeVisible();
  await expect(card.getByText("não publica produtos novos")).toBeVisible();
  await expect(card.getByRole("link", { name: `Publicar produtos em ${shopName}` })).toHaveCount(0);
  // The step-by-step names the address to change and ends at the check button.
  await expect(
    card.getByText(`${STAND_IN_WAREHOUSE.street}, ${STAND_IN_WAREHOUSE.number}`),
  ).toBeVisible();
  await expect(card.getByText("Como arrumar")).toBeVisible();
  await expect(
    card.getByRole("listitem").filter({ hasText: "Meus dados › Endereços" }),
  ).toBeVisible();

  await gotoHydrated(page, "/dashboard");
  await expect(page.getByText("Endereço de compra no fornecedor")).toBeVisible();

  await gotoHydrated(page, "/lojas");
  await setAccount(storeId, false);
  await card.getByRole("button", { name: "Já arrumei, conferir de novo" }).click();
  await expect(page.getByText("Endereço de compra certo").filter({ visible: true })).toBeVisible();
  await expect(card.getByText("Compras indo para o fornecedor")).toHaveCount(0);

  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await card.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow, `card overflows at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test("the team releases a false alarm and the store publishes again", async ({ browser }) => {
  test.setTimeout(150_000);
  const resellerContext = await browser.newContext();
  const reseller = await resellerContext.newPage();
  const { seller, shopName, storeId, supplier } = await heldStoreSetup(reseller, "Prédio");
  await setAccount(storeId, true);
  await gotoHydrated(reseller, "/lojas");
  const card = reseller.getByRole("listitem").filter({ hasText: shopName });
  await card.getByRole("button", { name: "Conferir agora" }).click();
  await expect(card.getByText("Compras indo para o fornecedor")).toBeVisible();
  // A reseller living at the supplier's address asks for the release through a ticket.
  await card
    .getByRole("link", { name: "Não é o endereço do fornecedor? Peça a liberação" })
    .click();
  await expect(reseller).toHaveURL(/\/suporte\/novo/);
  await expect(reseller.getByText("Minha loja conectada").first()).toBeVisible();
  await expect(reseller.locator("#new-ticket-body")).toHaveValue(/não é/);

  const team = await browser.newPage();
  await signIn(team, ADMIN_USER);
  await enableAdminMode(team);
  await gotoHydrated(team, `/admin/clientes/${seller.userId}`);
  await expect(team.getByText(`Compras indo para ${supplier.name}`)).toBeVisible();
  await team.getByRole("button", { name: "Liberar: é alarme falso" }).click();
  const dialog = team.getByRole("dialog");
  await dialog.getByRole("button", { name: "Liberar loja" }).click();
  await expect(dialog.getByText("Conte por que é alarme falso")).toBeVisible();
  await dialog
    .getByLabel("Por que é alarme falso?")
    .fill("Mora no mesmo prédio, outro apartamento");
  await dialog.getByRole("button", { name: "Liberar loja" }).click();
  await expect(
    team.getByText("Loja liberada para publicar").filter({ visible: true }),
  ).toBeVisible();
  await expect(team.getByText("Mora no mesmo prédio, outro apartamento")).toBeVisible();

  await gotoHydrated(reseller, "/lojas");
  await expect(card.getByText("Liberada pela equipe")).toBeVisible();
  await expect(card.getByText("Motivo: Mora no mesmo prédio, outro apartamento")).toBeVisible();
  await expect(card.getByRole("link", { name: `Publicar produtos em ${shopName}` })).toBeVisible();
  await resellerContext.close();
});
