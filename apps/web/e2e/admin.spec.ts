import { randomUUID } from "node:crypto";
import { expect, test, type Browser } from "@playwright/test";
import { createListingWithTargets, markTargetFailed } from "@sellbridge/database/repositories";
import { member, organization, storeConnections, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import {
  ADMIN_USER,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
  waitForHydration,
} from "./helpers";
import { e2eDatabase } from "./database";
import { forwardableProduct } from "./catalog-fixtures";

const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

/** Own failed listing: this test also works before any publication spec has run. */
async function customerWithListingIssue(browser: Browser) {
  const customerPage = await browser.newPage();
  const email = await signUp(customerPage, "Customer With Failed Listing");
  await customerPage.close();
  const [customer] = await database
    .select({ userId: user.id, tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  // A product of an active supplier: the listing's issue must be its failure, not the catalog.
  const product = await forwardableProduct(database);
  if (!customer || !product)
    throw new Error("Issue fixture requires a customer and catalog product");
  const [store] = await database
    .insert(storeConnections)
    .values({
      tenantId: customer.tenantId,
      marketplace: "mock",
      externalShopId: randomUUID(),
      shopName: "Issue fixture store",
    })
    .returning({ id: storeConnections.id });
  if (!store) throw new Error("Issue fixture store was not created");
  const listing = await createListingWithTargets(
    database,
    customer.tenantId,
    {
      supplierProductId: product.id,
      title: "Issue fixture listing",
      description: "Independent fixture for the customer issue queue",
      priceCents: 4990,
    },
    [store.id],
  );
  const targetId = listing.targetIds[0];
  if (!targetId) throw new Error("Issue fixture target was not created");
  await markTargetFailed(database, targetId, "Fixture publication failure", { final: true });
  return {
    email,
    async cleanup() {
      await database.delete(organization).where(eq(organization.id, customer.tenantId));
      await database.delete(user).where(eq(user.id, customer.userId));
    },
  };
}

test("admin edita um cliente, entra como ele e volta", async ({ browser }) => {
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  const email = await signUp(customerPage, "Cliente Painel Admin");
  await customerContext.close();

  const page = await browser.newPage();
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/clientes?query=${encodeURIComponent(email)}`);
  // The name opens the quick view in place; the full record is one link away.
  await page.getByRole("button", { name: /^Cliente Painel Admin/ }).click();
  const quickView = page.getByRole("region", { name: "Resumo de Cliente Painel Admin" });
  await expect(quickView.getByText("Primeiros passos", { exact: true })).toBeVisible();
  await quickView.getByRole("link", { name: "Ficha completa" }).click();
  await expect(page.getByRole("heading", { name: "Cliente Painel Admin" })).toBeVisible();

  await page.getByLabel("Nome", { exact: true }).fill("Cliente Renomeado");
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByRole("heading", { name: "Cliente Renomeado" })).toBeVisible();

  await page.getByRole("button", { name: "Entrar como cliente" }).click();
  // Impersonation reloads the document; the banner is server-rendered before React owns it.
  await expect(page.getByText("Você está usando a conta de")).toBeVisible();
  await waitForHydration(page);
  await page.getByRole("button", { name: "Voltar ao admin" }).click();
  await expect(page).toHaveURL(/\/admin\/clientes/);

  // Entering as the customer lands in their timeline.
  await gotoHydrated(page, `/admin/clientes?query=${encodeURIComponent(email)}`);
  await page.getByRole("button", { name: /^Cliente Renomeado/ }).click();
  const renamedView = page.getByRole("region", { name: "Resumo de Cliente Renomeado" });
  await expect(renamedView.getByText("Entrou como o cliente")).toBeVisible();
  await expect(renamedView.getByText("Editou nome ou e-mail")).toBeVisible();
  // The customer's own sign-up counts as a visit; the admin's session as them does not.
  await expect(renamedView.getByText("Último acesso do cliente")).toBeVisible();
});

test("admin finds customers by issue and journey", async ({ page, browser }) => {
  const fixture = await customerWithListingIssue(browser);
  try {
    await signIn(page, ADMIN_USER);
    await enableAdminMode(page);
    await gotoHydrated(page, `/admin/clientes?query=${encodeURIComponent(fixture.email)}`);
    await expect(page.getByRole("navigation", { name: "Filtrar por problema" })).toBeVisible();
    await page.getByRole("link", { name: /Publicações com erro/ }).click();
    await expect(page).toHaveURL(/issue=listings/);

    await page.getByRole("button", { name: "Pendências" }).click();
    const queue = page.getByRole("region", { name: "Pendências" });
    await expect(queue).toBeVisible();

    // Taking an issue moves it into the admin's own queue; letting it go puts it back.
    await queue.getByRole("button", { name: "Assumir" }).first().click();
    await expect(page.getByText("Pendência atribuída a você")).toBeVisible();
    await page.getByRole("button", { name: /^Comigo/ }).click();
    await expect(queue.getByText("Com você").first()).toBeVisible();
    await queue.getByRole("button", { name: "Devolver para a equipe" }).first().click();
    await expect(page.getByText("Pendência devolvida para a equipe")).toBeVisible();
    await page.getByRole("button", { name: /^Abertas/ }).click();
    await page.getByRole("button", { name: "Jornada" }).click();
    await expect(page.getByRole("region", { name: "Vendendo" })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("revendedor não acessa o painel de clientes", async ({ page }) => {
  await signUp(page, "Revendedor Sem Admin");
  await page.goto("/admin/clientes");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("modo administrador começa desligado e liga as ferramentas de admin", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await waitForHydration(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Modo administrador" });
  if ((await toggle.getAttribute("aria-checked")) === "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Clientes" })).toHaveCount(0);

  await enableAdminMode(page);
  await expect(page.getByText("Modo admin ativo")).toBeVisible();
  await page.getByRole("link", { name: "Clientes" }).click();
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
});

test("revendedor não vê o modo administrador", async ({ page }) => {
  await signUp(page, "Revendedor Sem Toggle");
  await waitForHydration(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Modo administrador" })).toHaveCount(0);
});
