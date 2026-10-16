import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database";
import { member, storeConnections, user } from "@sellbridge/database/schema";
import { eq, inArray } from "drizzle-orm";
import {
  ADMIN_USER,
  completeOnboarding,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
} from "./helpers";
import { requireEnvironmentVariable } from "./environment";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
/** Shops this spec inserted, removed at the end. */
const insertedShopIds: string[] = [];
/** About three hours ago, minus a margin so the label stays "há 3 horas" through a slow run. */
const THREE_HOURS_AGO = () => new Date(Date.now() - 3 * 3_600_000 + 5 * 60_000);

test.afterAll(async () => {
  if (insertedShopIds.length > 0) {
    await database
      .delete(storeConnections)
      .where(inArray(storeConnections.externalShopId, insertedShopIds));
  }
  await database.$client.end();
});

async function insertShop(values: {
  tenantId: string;
  shopName: string;
  lastError?: string;
}): Promise<void> {
  const externalShopId = `health-${Date.now()}-${insertedShopIds.length}`;
  insertedShopIds.push(externalShopId);
  await database.insert(storeConnections).values({
    ...values,
    marketplace: "mock",
    externalShopId,
    lastWebhookAt: THREE_HOURS_AGO(),
  });
}

/** The organization of a freshly signed-up account, so no other spec ever sees its stores. */
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

test("the store menu shows the store's health: sync, marketplace events and access", async ({
  page,
}) => {
  const email = await signUp(page, "Revendedora Saúde");
  await completeOnboarding(page);
  const shopName = `Loja saúde E2E ${Date.now()}`;
  await insertShop({ tenantId: (await sellerOf(email)).tenantId, shopName });

  await gotoHydrated(page, "/lojas");
  const menuButton = page.getByRole("button", { name: `Opções de ${shopName}` });
  // Screen readers get the same facts from the button, since a menu only walks its items.
  await expect(menuButton).toHaveAccessibleDescription(/Saúde da loja: .*há 3 horas/);
  await menuButton.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByText("Saúde da loja")).toBeVisible();
  await expect(menu.getByText("Última sincronização")).toBeVisible();
  await expect(menu.getByText("Ainda não houve")).toBeVisible();
  await expect(menu.getByText("Último aviso de pedido")).toBeVisible();
  await expect(menu.getByText("há 3 horas")).toBeVisible();
  await expect(menu.getByText("Em dia, renova sozinho")).toBeVisible();
  for (const width of [320, 375, 768, 1280]) {
    // Reopened at each width: a resize may close or move the menu.
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width, height: 900 });
    await menuButton.click();
    await expect(menu.getByText("Saúde da loja")).toBeVisible();
    const overflow = await menu.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow, `menu overflows at ${width}px`).toBeLessThanOrEqual(0);
    await menu.screenshot({ path: test.info().outputPath(`store-health-menu-${width}.png`) });
  }
});

test("the customer page in the admin shows the same store health", async ({ browser }) => {
  const customerContext = await browser.newContext();
  const email = await signUp(await customerContext.newPage(), "Cliente Saúde Admin");
  await customerContext.close();
  const seller = await sellerOf(email);
  const shopName = `Loja admin saúde ${Date.now()}`;
  await insertShop({
    tenantId: seller.tenantId,
    shopName,
    lastError: "Falha ao renovar o acesso da loja; tentaremos de novo",
  });

  const adminContext = await browser.newContext();
  const page = await adminContext.newPage();
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/clientes/${seller.userId}`);
  const row = page.getByRole("listitem").filter({ hasText: shopName });
  await expect(row.getByText("Atenção", { exact: true })).toBeVisible();
  await expect(row.getByText("há 3 horas")).toBeVisible();
  await expect(row.getByText("Renovação falhou, tentaremos de novo")).toBeVisible();
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await row.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow, `admin store row overflows at ${width}px`).toBeLessThanOrEqual(0);
    // A squeezed column would stack the text one word per line: the row stays compact instead.
    const height = (await row.boundingBox())?.height ?? Number.POSITIVE_INFINITY;
    expect(height, `admin store row height at ${width}px`).toBeLessThan(260);
    await row.screenshot({ path: test.info().outputPath(`admin-store-health-${width}.png`) });
  }
  await adminContext.close();
});
