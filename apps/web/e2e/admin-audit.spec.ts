import { type Browser, expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { supplierProducts, suppliers, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn, signUp } from "./helpers";

/* Item 28.b: what the team did, in one trail at /admin/auditoria, for admins only. */
const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const RUN = Date.now();
const SUPPLIER = `Fornecedor auditoria ${RUN}`;
const PRODUCT = `Produto auditado ${RUN}`;
let supplierId = "";

test.beforeAll(async () => {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: SUPPLIER, niche: "Teste", state: "SP", city: "São Paulo" })
    .returning({ id: suppliers.id });
  supplierId = supplier?.id ?? "";
  await database.insert(supplierProducts).values({
    supplierId,
    sku: `AUD-${RUN}`,
    title: PRODUCT,
    costCents: 1000,
    suggestedPriceCents: 2000,
    stock: 3,
  });
});

test.afterAll(async () => {
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

/** A fresh account given a team role straight in the database. */
async function agentPage(browser: Browser) {
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  const email = await signUp(page, "Atendente Auditoria");
  await database.update(user).set({ role: "agent" }).where(eq(user.email, email));
  return { context, page };
}

test("a desativação de um produto aparece na auditoria do admin", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}`);
  await page
    .getByRole("row", { name: new RegExp(PRODUCT) })
    .getByRole("button", { name: "Desativar", exact: true })
    .click();
  await expect(page.getByRole("row", { name: new RegExp(PRODUCT) })).toContainText("Desativado");

  // Reached from the account menu, as the header has no room for another team tab.
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Auditoria" }).click();
  await expect(page.getByRole("heading", { name: "Auditoria", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Catálogo", exact: true }).click();
  await expect(page).toHaveURL(/source=catalog/);
  await page.getByLabel("Buscar na auditoria").fill(PRODUCT);
  await expect(page).toHaveURL(/query=/);
  const row = page.getByRole("row", { name: new RegExp(PRODUCT) });
  await expect(row).toContainText("Desativou o produto");
  await expect(row).toContainText("Admin SellBridge");
});

test("só o admin abre a auditoria: atendente e revendedor ficam de fora", async ({ browser }) => {
  const agent = await agentPage(browser);
  // The role is read on every request: the open session picks it up on the next page load.
  await gotoHydrated(agent.page, "/dashboard");
  await enableAdminMode(agent.page);
  await agent.page.goto("/admin/auditoria");
  await expect(agent.page).toHaveURL(/\/admin\/chamados/);
  await agent.page.getByRole("button", { name: "Menu do usuário" }).click();
  await expect(agent.page.getByRole("menuitem", { name: "Auditoria" })).toHaveCount(0);
  await agent.context.close();

  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signIn(reseller, DEMO_USER);
  await reseller.goto("/admin/auditoria");
  await expect(reseller).toHaveURL(/\/dashboard/);
  await resellerContext.close();
});
