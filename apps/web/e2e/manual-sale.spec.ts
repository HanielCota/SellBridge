import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { orders } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { forwardableProduct } from "./catalog-fixtures";
import { e2eDatabase } from "./database";
import {
  DEMO_USER,
  gotoHydrated,
  labelContentMismatches,
  signIn,
  stubCepNotFound,
} from "./helpers";

const database = e2eDatabase();
const externalOrderId = `SHOPEE-E2E-${Date.now()}`;
const labelFile = fileURLToPath(new URL("./fixtures/shipping-label.pdf", import.meta.url));

test.beforeEach(async ({ page }) => {
  await stubCepNotFound(page);
});

// The demo's manual store stays: it is off every store list, and other runs may have sales on it.
test.afterAll(async () => {
  await database.delete(orders).where(eq(orders.externalOrderId, externalOrderId));
  await database.$client.end();
});

test("registers a Shopee sale by hand, reads its label and forwards it to the supplier", async ({
  page,
}) => {
  const product = await forwardableProduct(database);
  if (product === undefined) {
    throw new Error("Seed catalog missing");
  }
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos");
  // While the page settles after signing in, the old and the new view can both be on screen.
  const manualSaleLink = page.getByRole("link", { name: "Registrar venda manual" });
  await expect(manualSaleLink).toHaveCount(1);
  await manualSaleLink.click();
  await expect(page.getByRole("heading", { name: "Registrar venda manual" })).toBeVisible();

  await page.getByRole("button", { name: "Registrar venda" }).click();
  await expect(page.getByLabel("Número do pedido")).toBeFocused();
  await expect(page.getByText("Adicione pelo menos um produto")).toBeVisible();

  await page.getByLabel("Número do pedido").fill(externalOrderId);
  await expect(page.getByText("Informe o número do pedido, como aparece no canal")).toBeHidden();
  await page.getByLabel("Nome do comprador").fill("Maria da Silva");
  await page.getByLabel("Buscar produto").fill(product.title);
  // Products can share a title (two suppliers, or two variants): the button names the code too.
  await page
    .getByRole("button", { name: `Adicionar ${product.title}, código ${product.sku}` })
    .click();
  // The button now shows "Adicionado", and its name says so too.
  expect(await labelContentMismatches(page)).toEqual([]);
  const item = page.getByRole("list", { name: "Produtos da venda" });
  await item.getByLabel("Quantidade").fill("2");
  await page.getByRole("button", { name: "Registrar venda" }).click();

  await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}/);
  await page.getByLabel("Arquivo da etiqueta de envio").setInputFiles(labelFile);
  await expect(page.getByLabel("CEP", { exact: true })).toHaveValue("01310-100", {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Enviar pedido ao fornecedor" }).click();
  await expect(page.getByLabel("Link do fornecedor").first()).toBeVisible();

  const [order] = await database
    .select({ status: orders.status, totalCents: orders.totalCents })
    .from(orders)
    .where(eq(orders.externalOrderId, externalOrderId));
  expect(order).toEqual({ status: "paid", totalCents: product.suggestedPriceCents * 2 });
});

test("fits a phone screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, DEMO_USER);

  await gotoHydrated(page, "/pedidos/venda-manual");
  await expect(page.getByRole("list", { name: "Produtos encontrados" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
