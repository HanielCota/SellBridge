import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { member, suppliers, supplierProducts, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, signIn, signUpAsSupplier } from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));

test.afterAll(async () => {
  await database.$client.end();
});

/** Stands in for the brand step: links a new supplier to the account's profile. */
async function giveBrand(email: string, name: string): Promise<void> {
  const [profile] = await database
    .select({ organizationId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (profile === undefined) {
    throw new Error(`Conta de teste sem perfil: ${email}`);
  }
  await database.insert(suppliers).values({
    name,
    niche: "Casa e decoração",
    state: "SP",
    city: "Campinas",
    organizationId: profile.organizationId,
  });
}

test("fornecedor recém-cadastrado vai direto para o cadastro da marca", async ({ page }) => {
  await signUpAsSupplier(page, "Ateliê Sem Marca");

  await expect(page).toHaveURL(/\/fornecedor\/painel\/marca\?perfil=[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { name: "Cadastre sua marca" })).toBeVisible();

  await gotoHydrated(page, "/dashboard");
  await expect(page).toHaveURL(/\/fornecedor\/painel\/marca\?perfil=[a-z0-9-]+$/);
  await gotoHydrated(page, "/fornecedor/painel/pedidos");
  await expect(page).toHaveURL(/\/fornecedor\/painel\/marca\?perfil=[a-z0-9-]+$/);
});

test("fornecedor com marca abre o próprio painel com os dados carregados", async ({ page }) => {
  const email = await signUpAsSupplier(page, "Ateliê Com Marca");
  await giveBrand(email, "Ateliê Com Marca");

  await gotoHydrated(page, "/fornecedor/painel");
  await expect(page.getByRole("heading", { name: "Nada esperando por você" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Meus produtos" }).first()).toBeVisible();
  await expect(page.getByText("Fornecedor", { exact: true }).first()).toBeVisible();

  const profile = new URL(page.url()).searchParams.get("perfil");
  for (const name of ["Ver pedidos", "Ver desempenho"]) {
    const href = await page.getByRole("link", { name, exact: true }).getAttribute("href");
    expect(new URL(href ?? "", page.url()).searchParams.get("perfil")).toBe(profile);
  }

  await page.getByRole("link", { name: "Meus produtos" }).first().click();
  await expect(page.getByRole("heading", { name: "Produtos" })).toBeVisible();
});

for (const mobile of [false, true]) {
  test(`supplier can find product registration from the home panel on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const email = await signUpAsSupplier(page, "Supplier navigation fixture");
    await giveBrand(email, "Supplier navigation fixture");
    await gotoHydrated(page, "/fornecedor/painel");
    const create = page.getByRole("link", { name: "Cadastrar produto", exact: true });
    await expect(create).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Painel do fornecedor", exact: true }),
    ).toBeVisible();
    const profile = new URL(page.url()).searchParams.get("perfil");
    const target = await create.getAttribute("href");
    expect(new URL(target ?? "", page.url()).searchParams.get("perfil")).toBe(profile);
    await create.click();
    await expect(page.getByRole("heading", { name: "Novo produto", exact: true })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Etapas do cadastro", exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("product")).toBe("novo");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

test("supplier draft keeps its saved address and fields after a reload", async ({ page }) => {
  const email = await signUpAsSupplier(page, "Supplier saved draft fixture");
  await giveBrand(email, "Supplier saved draft fixture");
  await gotoHydrated(page, "/fornecedor/painel/produtos?product=novo");
  await page.getByRole("button", { name: /2\..*Dados obrigatórios/ }).click();
  const sku = `RESUME-${Date.now()}`;
  await page.getByLabel("Código", { exact: true }).fill(sku);
  await page.getByLabel("Título", { exact: true }).fill("Supplier draft kept after reload");
  await page.getByLabel("Custo (R$)", { exact: true }).fill("12,00");
  await page.getByLabel("Estoque (un.)", { exact: true }).fill("7");
  await expect(page.getByText(/Salvo às/)).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("product"))
    .toMatch(/^[a-f0-9-]{36}$/);
  await gotoHydrated(page, page.url());
  await page.getByRole("button", { name: /2\..*Dados obrigatórios/ }).click();
  await expect(page.getByLabel("Código", { exact: true })).toHaveValue(sku);
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(
    "Supplier draft kept after reload",
  );
  expect(
    await database
      .select({ id: supplierProducts.id })
      .from(supplierProducts)
      .where(eq(supplierProducts.sku, sku)),
  ).toHaveLength(1);
});

test("supplier keeps unsaved input when leaving the draft is cancelled", async ({ page }) => {
  const email = await signUpAsSupplier(page, "Supplier unsaved draft fixture");
  await giveBrand(email, "Supplier unsaved draft fixture");
  await gotoHydrated(page, "/fornecedor/painel/produtos?product=novo");
  await page.getByRole("button", { name: /2\..*Dados obrigatórios/ }).click();
  await page.getByLabel("Título", { exact: true }).fill("Unfinished supplier product");
  let confirmationShown = false;
  page.once("dialog", async (dialog) => {
    confirmationShown = true;
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Produtos", exact: true }).click();
  await expect.poll(() => confirmationShown).toBe(true);
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(
    "Unfinished supplier product",
  );
});

test("fornecedor não usa as rotas de revendedor", async ({ page }) => {
  await signUpAsSupplier(page, "Ateliê Sem Acesso");

  const response = await page.request.get("/api/financeiro/exportar");

  expect(response.status()).toBe(403);
});

test("revendedor não abre o painel do fornecedor", async ({ page }) => {
  await signIn(page, DEMO_USER);

  await gotoHydrated(page, "/fornecedor/painel");

  await expect(page).toHaveURL(/\/dashboard/);
});
