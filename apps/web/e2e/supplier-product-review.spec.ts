import { expect, test, type Page } from "@playwright/test";
import { createDatabase } from "@sellbridge/database";
import { supplierProducts, suppliers } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";
import { requireEnvironmentVariable } from "./environment";

/**
 * Supplier panel review flow: a product a supplier sent stays out of the resellers' catalog
 * until an admin approves it, and a rejection keeps it out with the reason on the product.
 */
const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const stamp = Date.now();
const titles = {
  live: `Comedouro aprovado ${stamp}`,
  toApprove: `Bebedouro para aprovar ${stamp}`,
  toReject: `Arranhador para reprovar ${stamp}`,
  resubmitted: `Vaso reenviado ${stamp}`,
};
let supplierId = "";
const productIds = { toApprove: "", toReject: "", resubmitted: "" };

async function insertProduct(sku: string, title: string, inReview: boolean): Promise<string> {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku,
      title,
      description: "Produto de teste do fluxo de análise",
      costCents: 2500,
      suggestedPriceCents: 4990,
      stock: 10,
      imageUrls: [],
      reviewStatus: inReview ? "in_review" : "approved",
      submittedAt: inReview ? new Date() : null,
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) {
    throw new Error(`produto ${sku} não criado`);
  }
  return product.id;
}

async function resellerSees(page: Page): Promise<(title: string) => ReturnType<Page["getByRole"]>> {
  await gotoHydrated(page, `/fornecedores/${supplierId}`);
  await expect(page.getByRole("heading", { name: titles.live })).toBeVisible();
  return (title) => page.getByRole("heading", { name: title });
}

test.beforeAll(async () => {
  const [supplier] = await database
    .insert(suppliers)
    .values({
      // Long like the names that pushed the queue's last column out of view.
      name: `Fornecedor análise E2E ${stamp} 0b8683e6-26dd-4e65-bc66-157bfaf630ba`,
      niche: "Pet",
      state: "RJ",
      city: "Teste",
    })
    .returning({ id: suppliers.id });
  if (supplier === undefined) {
    throw new Error("fornecedor não criado");
  }
  supplierId = supplier.id;
  await insertProduct(`LIVE-${stamp}`, titles.live, false);
  productIds.toApprove = await insertProduct(`APR-${stamp}`, titles.toApprove, true);
  productIds.toReject = await insertProduct(`REJ-${stamp}`, titles.toReject, true);
  productIds.resubmitted = await insertResubmittedProduct();
});

/** A product rejected for its barcode, fixed and sent again, without a brand. */
async function insertResubmittedProduct(): Promise<string> {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `RES-${stamp}`,
      title: titles.resubmitted,
      description: "Vaso de cerâmica para o teste de reenvio",
      costCents: 3500,
      suggestedPriceCents: 7990,
      stock: 40,
      imageUrls: [],
      mercadoLivreAttributes: { GTIN: "7891234567895", SELLER_PACKAGE_WEIGHT: "900" },
      reviewStatus: "in_review",
      rejectionReasons: [
        {
          field: "attributes.GTIN",
          rule: "gtin_recommended",
          message: "Informe o código de barras (GTIN)",
        },
      ],
      submittedAt: new Date(),
      reviewedAt: new Date(Date.now() - 3_600_000),
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) {
    throw new Error("produto reenviado não criado");
  }
  return product.id;
}

test.afterAll(async () => {
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

test("só os produtos aprovados pelo admin chegam ao catálogo do revendedor", async ({
  browser,
  page,
}) => {
  const reseller = await browser.newPage();
  await signIn(reseller, DEMO_USER);
  const before = await resellerSees(reseller);
  await expect(before(titles.toApprove)).toHaveCount(0);
  await expect(before(titles.toReject)).toHaveCount(0);

  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/fornecedores/analise?query=${stamp}`);
  await expect(page.getByRole("link", { name: titles.toApprove }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: titles.toReject }).first()).toBeVisible();

  await test.step("aprova um produto", async () => {
    await gotoHydrated(page, `/admin/fornecedores/analise/${productIds.toApprove}`);
    await expect(page.getByRole("heading", { name: titles.toApprove })).toBeVisible();
    await page.getByRole("button", { name: /^Aprovar/ }).click();
    await expect(page.getByText("Produto aprovado")).toBeVisible();
  });

  await test.step("reprova o outro com motivo nas imagens", async () => {
    await gotoHydrated(page, `/admin/fornecedores/analise/${productIds.toReject}`);
    await expect(page.getByRole("heading", { name: titles.toReject })).toBeVisible();
    // Sending without a reason is refused on the page, before reaching the server.
    await page.getByRole("button", { name: "Reprovar com 0 motivos" }).click();
    await expect(page.getByRole("alert")).toContainText("pelo menos um motivo");
    await page.getByRole("combobox", { name: "Adicionar motivo" }).click();
    await page.getByRole("option", { name: "Imagem fora do padrão" }).click();
    await page.getByRole("button", { name: "Reprovar com 1 motivo" }).click();
    await expect(page.getByText("Produto reprovado")).toBeVisible();
  });

  const [rejected] = await database
    .select({
      status: supplierProducts.reviewStatus,
      reasons: supplierProducts.rejectionReasons,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productIds.toReject));
  expect(rejected?.status).toBe("rejected");
  expect(rejected?.reasons).toEqual([expect.objectContaining({ field: "imageUrls" })]);

  const after = await resellerSees(reseller);
  await expect(after(titles.toApprove)).toBeVisible();
  await expect(after(titles.toReject)).toHaveCount(0);
  await reseller.close();
});

test("o reenvio mostra o que foi pedido, e a análise fala português", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  // The width where long supplier names pushed the queue's last column out of view.
  await page.setViewportSize({ width: 914, height: 862 });

  await test.step("a fila marca o reenvio e cabe na tela", async () => {
    await gotoHydrated(page, `/admin/fornecedores/analise?query=RES-${stamp}`);
    await expect(page.getByRole("link", { name: titles.resubmitted }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "Reenvio" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Enviado" })).toBeInViewport({
      ratio: 1,
    });
  });

  await gotoHydrated(page, `/admin/fornecedores/analise/${productIds.resubmitted}`);
  await expect(page.getByRole("heading", { name: titles.resubmitted })).toBeVisible();

  await test.step("cada motivo anterior vem com o campo como está agora", async () => {
    const previous = page.getByRole("list", { name: "Motivos da última reprovação" });
    await expect(previous).toContainText("Código de barras ausente");
    await expect(previous).toContainText("Código de barras (GTIN) agora: 7891234567895");
  });

  await test.step("a ficha técnica usa nomes e unidades", async () => {
    await expect(page.getByText("Peso da embalagem", { exact: true })).toBeVisible();
    await expect(page.getByText("900 g", { exact: true })).toBeVisible();
    await expect(page.getByText("SELLER_PACKAGE_WEIGHT")).toHaveCount(0);
  });

  await test.step("um item de completude vira motivo com título e campo", async () => {
    await page.getByRole("button", { name: "Informe a marca" }).click();
    await expect(page.getByText("Marca ausente", { exact: true })).toBeVisible();
    await expect(page.getByText("brand_recommended")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Campo" })).toHaveText("Marca");
  });
});
