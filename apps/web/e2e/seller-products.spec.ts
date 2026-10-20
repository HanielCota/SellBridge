import { expect, test, type Page } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { supplierProducts } from "@sellbridge/database/schema";
import { eq, sql } from "drizzle-orm";
import { ADMIN_USER, enableAdminMode, gotoHydrated, signIn, signUp } from "./helpers";
import { requireEnvironmentVariable } from "./environment";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
test.afterAll(async () => {
  await database.$client.end();
});

test("seller can start a product from the dashboard and read Portuguese product filters", async ({
  page,
}) => {
  await signUp(page, "Product navigation fixture");
  await gotoHydrated(page, "/dashboard");
  const profile = new URL(page.url()).searchParams.get("perfil");
  await page.getByRole("button", { name: "Cadastrar produto", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Novo produto", exact: true })).toBeVisible();
  await expect(page.getByLabel("Nome do produto", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Estoque total", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  expect(new URL(page.url()).searchParams.get("perfil")).toBe(profile);
  await page.getByRole("button", { name: "Voltar aos produtos", exact: true }).click();
  const filters = page.getByLabel("Situação do produto", { exact: true });
  await expect(filters.locator("option")).toHaveText([
    "Todos",
    "Rascunhos",
    "Prontos para publicar",
    "Arquivados",
    "Bloqueados",
  ]);
  await filters.selectOption("archived");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(filters).toHaveValue("all");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByPlaceholder("Buscar produtos, publicações, pedidos ou páginas").fill("cadastro");
  await page.getByRole("option", { name: "Meu cadastro", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
});

async function createProduct(page: Page, sku: string) {
  await gotoHydrated(page, "/products");
  await page.getByRole("button", { name: "Cadastrar produto", exact: true }).click();
  await page.getByLabel("SKU", { exact: true }).fill(sku);
  await page.getByLabel("Nome do produto", { exact: true }).fill("Private cotton home accessory");
  await page.getByLabel("Custo por unidade (R$)").fill("12,00");
  await page.getByLabel("Preço de venda (R$)").fill("30,00");
  await page.getByLabel("Estoque total").fill("7");
  await page.getByLabel("Categoria", { exact: true }).selectOption({ index: 1 });
  await page
    .getByLabel("Enviar imagens", { exact: true })
    .setInputFiles({ name: "product.png", mimeType: "image/png", buffer: PIXEL_PNG });
  await expect(page.getByText("Todas as alterações foram salvas", { exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("product");
  if (id === null) throw new Error("Missing product identifier");
  return id;
}

test("seller drafts resume, preserve live stock, duplicate safely and archive", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "Private Inventory Customer");
  const sku = `OWN-${Date.now()}`;
  const id = await createProduct(page, sku);
  await page.reload();
  await expect(page.getByLabel("SKU", { exact: true })).toHaveValue(sku);
  await expect(page.getByRole("img", { name: "Imagem do produto 1" })).toBeVisible();
  await database
    .update(supplierProducts)
    .set({ stock: 5, updatedAt: sql`${supplierProducts.updatedAt}` })
    .where(eq(supplierProducts.id, id));
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Updated description after a concurrent sale.");
  await expect(page.getByLabel("Estoque total")).toHaveValue("5");
  await expect(page.getByText("Todas as alterações foram salvas", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Deixar pronto para publicar", exact: true }).click();
  await expect(page.getByText("Pronto para publicar", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Arquivar produto", exact: true }).click();
  await expect(page.getByText("Arquivado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voltar aos produtos", exact: true }).click();
  await page.getByLabel("Situação do produto", { exact: true }).selectOption("archived");
  await expect(page.getByText(sku, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Editar produto", exact: true }).click();
  await page.getByRole("button", { name: "Deixar pronto para publicar", exact: true }).click();
  await expect(page.getByText("Pronto para publicar", { exact: true })).toBeVisible();
  await page.getByLabel("Código do produto duplicado (SKU)", { exact: true }).fill(`${sku}-COPY`);
  await page.getByRole("button", { name: "Duplicar como rascunho", exact: true }).click();
  await expect(page.getByLabel("SKU", { exact: true })).toHaveValue(`${sku}-COPY`);
  await expect(page.getByLabel("Estoque total")).toHaveValue("0");
});

test("a second seller cannot see or modify another seller's product", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signUp(page, "First Private Seller");
  const sku = `ISOLATED-${Date.now()}`;
  const id = await createProduct(page, sku);
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await signUp(otherPage, "Second Private Seller");
    await gotoHydrated(otherPage, "/products");
    await expect(otherPage.getByText(sku, { exact: false })).toHaveCount(0);
    await gotoHydrated(otherPage, `/products?product=${id}`);
    await expect(otherPage.getByLabel("Nome do produto", { exact: true })).toHaveValue("");
    const denied = await otherPage.request.post("/api/admin/product-images", {
      multipart: { file: { name: "product.png", mimeType: "image/png", buffer: PIXEL_PNG } },
    });
    expect(denied.status()).toBe(403);
    const csrf = await otherPage.request.post("/api/products/images", {
      headers: { origin: "https://untrusted.example" },
      multipart: { file: { name: "product.png", mimeType: "image/png", buffer: PIXEL_PNG } },
    });
    expect(csrf.status()).toBe(403);
  } finally {
    await other.close();
  }
});

test("admin corrections require a reason and platform blocks survive owner edits", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "Managed Product Customer");
  const sku = `ADMIN-OWN-${Date.now()}`;
  await createProduct(page, sku);
  const admin = await browser.newContext();
  try {
    const adminPage = await admin.newPage();
    await signIn(adminPage, ADMIN_USER);
    await enableAdminMode(adminPage);
    await gotoHydrated(adminPage, `/admin/products?query=${sku}&origin=seller`);
    await adminPage
      .getByRole("button", { name: "Gerenciar produto do cliente", exact: true })
      .click();
    await adminPage
      .getByLabel("Nome do produto", { exact: true })
      .fill("Administrator corrected product title");
    await expect(
      adminPage.getByRole("button", { name: "Salvar agora", exact: true }),
    ).toBeDisabled();
    await adminPage
      .getByLabel("Motivo da alteração administrativa")
      .fill("Corrected the customer product title.");
    await expect(
      adminPage.getByText("Todas as alterações foram salvas", { exact: true }),
    ).toBeVisible();
    await expect(
      adminPage
        .getByRole("region", { name: "Ações e histórico do produto" })
        .getByText("Corrected the customer product title.", { exact: true }),
    ).toBeVisible();
    await adminPage.getByRole("button", { name: "Bloquear produto", exact: true }).click();
    await expect(adminPage.getByText("Bloqueado", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Bloqueado", { exact: true })).toBeVisible();
    await page
      .getByLabel("Nome do produto", { exact: true })
      .fill("Owner corrected blocked product");
    await expect(page.getByText("Todas as alterações foram salvas", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Deixar pronto para publicar", exact: true }),
    ).toBeDisabled();
  } finally {
    await admin.close();
  }
});

test("the product editor remains usable on a phone", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page, "Mobile Product Customer");
  await createProduct(page, `MOBILE-${Date.now()}`);
  await expect(page.getByLabel("Nome do produto", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await testInfo.attach("mobile-product-editor", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("unsaved product changes stay when leaving is cancelled", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Unsaved Product Customer");
  await gotoHydrated(page, "/products");
  await page.getByRole("button", { name: "Cadastrar produto", exact: true }).click();
  await page.getByLabel("Nome do produto", { exact: true }).fill("Unfinished private accessory");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Voltar aos produtos", exact: true }).click();
  await expect(page.getByLabel("Nome do produto", { exact: true })).toHaveValue(
    "Unfinished private accessory",
  );
  await page.getByLabel("SKU", { exact: true }).fill(`SAVED-${Date.now()}`);
  await expect(page.getByText("Todas as alterações foram salvas", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voltar aos produtos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cadastrar produto", exact: true })).toBeVisible();
});
