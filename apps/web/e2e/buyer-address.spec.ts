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
import { completeOnboarding, gotoHydrated, signUp, waitForHydration } from "./helpers";
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

async function tenantOf(email: string): Promise<string> {
  const [seller] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);
  if (seller === undefined) {
    throw new Error("Conta nova sem organização no banco de teste");
  }
  return seller.tenantId;
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
  const email = await signUp(page, "Revendedora Endereço");
  await completeOnboarding(page);
  await expect(page).toHaveURL(/\/lojas/);
  const shopName = `Loja Endereço E2E ${Date.now()}`;
  await connectStore(page, shopName);

  const tenantId = await tenantOf(email);
  const [store] = await database
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(and(eq(storeConnections.tenantId, tenantId), eq(storeConnections.shopName, shopName)));
  if (store === undefined) {
    throw new Error("Loja conectada não encontrada");
  }
  const supplier = await createWarehouseSupplier();
  await database
    .insert(storeSuppliers)
    .values({ storeConnectionId: store.id, supplierId: supplier.id });

  // The test consent gives the shop an id Mercado Livre would never use, so it was not read.
  await gotoHydrated(page, "/lojas");
  const card = page.getByRole("listitem").filter({ hasText: shopName });
  await expect(card.getByText("Endereço de compra não conferido")).toBeVisible();

  await setAccount(store.id, true);
  await card.getByRole("button", { name: "Conferir agora" }).click();
  await expect(card.getByText("Compras indo para o fornecedor")).toBeVisible();
  await expect(card.getByText(`vão chegar em ${supplier.name}`)).toBeVisible();
  await expect(card.getByText("não publica produtos novos")).toBeVisible();
  await expect(card.getByRole("link", { name: `Publicar produtos em ${shopName}` })).toHaveCount(0);

  await gotoHydrated(page, "/dashboard");
  await expect(page.getByText("Endereço de compra no fornecedor")).toBeVisible();

  await gotoHydrated(page, "/lojas");
  await setAccount(store.id, false);
  await card.getByRole("button", { name: "Já arrumei, conferir de novo" }).click();
  await expect(page.getByText("Endereço de compra certo").filter({ visible: true })).toBeVisible();
  await expect(card.getByText("Compras indo para o fornecedor")).toHaveCount(0);

  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await card.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow, `card overflows at ${width}px`).toBeLessThanOrEqual(0);
  }
});
