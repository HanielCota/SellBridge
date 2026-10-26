import { expect, test, type Page } from "@playwright/test";
import { supplierProducts, suppliers } from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import {
  ADMIN_USER,
  completeOnboarding,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
  waitForHydration,
} from "./helpers";
import { e2eDatabase } from "./database";

/*
 * Item 18: a product imported by CSV with brand, model and barcode publishes without a missing
 * attribute error. "[exige atributos]" makes the simulated marketplace refuse the listing
 * without BRAND, MODEL and GTIN, as a Mercado Livre category that requires them does.
 */
const database = e2eDatabase();
const SUPPLIER = "BH Beauty Distribuidora";
const RUN = Date.now();
const SKU = `CSV-ATTR-${RUN}`;
const TITLE = `Kit escova [exige atributos] ${RUN}`;
/** Worker round trip (queue + mocked marketplace latency) before a status settles. */
const STATUS_TIMEOUT = 20_000;

let supplierId = "";

test.beforeAll(async () => {
  const [supplier] = await database
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.name, SUPPLIER));
  if (supplier === undefined) {
    throw new Error(`fornecedor ${SUPPLIER} não está no seed`);
  }
  supplierId = supplier.id;
});

test.afterAll(async () => {
  // Listings hold the product: the reseller's tenant is left, the product only deactivated.
  await database
    .update(supplierProducts)
    .set({ active: false })
    .where(and(eq(supplierProducts.supplierId, supplierId), eq(supplierProducts.sku, SKU)));
  await database.$client.end();
});

async function importProductWithAttributes(page: Page) {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}`);
  const csv = [
    "sku;titulo;descricao;custo;estoque;marca;modelo;gtin;peso_g;altura_cm;largura_cm;comprimento_cm",
    `${SKU};${TITLE};Escova de cerdas macias para cabelos finos;19,90;8;Escova Bela;EB-10;7891234567895;350;6;12;25`,
  ].join("\n");
  await page
    .getByLabel("Arquivo CSV (UTF-8) ou planilhas .xlsx")
    .setInputFiles({ name: "atributos.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Gerar prévia" }).click();
  await expect(
    page.getByText("1 produtos serão criados e 0 atualizados. 0 linhas com erro."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  // Other specs may leave listings the import pauses: the sentence then goes on after the counts.
  await expect(page.getByText(/^Importação concluída: 1 criados e 0 atualizados/)).toBeVisible();
}

async function connectMockStore(page: Page, shopName: string) {
  await gotoHydrated(page, "/lojas");
  await page.getByRole("link", { name: "Conectar Mercado Livre" }).click();
  await expect(page.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill(shopName);
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(
    page.getByText(`Loja "${shopName}" conectada`).filter({ visible: true }),
  ).toBeVisible({ timeout: STATUS_TIMEOUT });
}

test("produto importado por CSV com marca, modelo e GTIN vai ao ar sem erro de atributo", async ({
  page,
  browser,
}) => {
  // Two accounts, an import, onboarding, a store and a worker round trip.
  test.setTimeout(180_000);
  await importProductWithAttributes(page);

  const resellerContext = await browser.newContext({ locale: "pt-BR" });
  const reseller = await resellerContext.newPage();
  await signUp(reseller, "Revendedora Atributos");
  await expect(reseller).toHaveURL(/\/onboarding/);
  await completeOnboarding(reseller, SUPPLIER);
  await expect(reseller).toHaveURL(/\/lojas/);
  await connectMockStore(reseller, "Loja Atributos");

  await gotoHydrated(reseller, `/fornecedores/${supplierId}?query=${encodeURIComponent(SKU)}`);
  await reseller.getByRole("link", { name: "Publicar" }).first().click();
  await expect(reseller.getByRole("heading", { name: "Nova publicação" })).toBeVisible();
  await reseller.waitForLoadState("networkidle");
  await expect(reseller.getByLabel("Título")).toHaveValue(TITLE);
  await reseller.getByRole("button", { name: "Publicar" }).click();

  await expect(reseller).toHaveURL(/\/publicacoes(?:\?|$)/);
  await expect(
    reseller.getByText("No ar na Loja Atributos", { exact: true }).filter({ visible: true }),
  ).toBeVisible({ timeout: STATUS_TIMEOUT });
  await expect(reseller.getByText(/Faltam atributos obrigatórios/)).toHaveCount(0);
  await resellerContext.close();
});
