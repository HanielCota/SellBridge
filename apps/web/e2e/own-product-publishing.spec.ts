import { expect, test, type Page } from "@playwright/test";
import { fillBillingHolder, gotoHydrated, signUp, waitForHydration } from "./helpers";

const TITLE = "Seller-owned cotton accessory";

async function createOwnProduct(page: Page) {
  await gotoHydrated(page, "/products");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("SKU", { exact: true }).fill(`OWN-PUBLISH-${Date.now()}`);
  await page.getByLabel("Product title", { exact: true }).fill(TITLE);
  await page
    .getByLabel("Description", { exact: true })
    .fill("A handmade cotton accessory shipped by this seller, with all materials described.");
  await page.getByLabel("Unit cost (BRL)").fill("12,00");
  await page.getByLabel("Selling price (BRL)").fill("30,00");
  await page.getByLabel("Stock on hand").fill("7");
  await page.getByLabel("Category", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Upload images", { exact: true }).setInputFiles({
    name: "product.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Make ready", exact: true }).click();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
}

test("seller-owned product publishes through the worker to a supplier-free store", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page, "Own Publishing Customer");
  await fillBillingHolder(page);
  await page.getByRole("radio", { name: /^My own products/ }).check();
  await page.getByRole("button", { name: "Save product sources", exact: true }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
  await page.getByRole("link", { name: "Conectar Loja simulada" }).click();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill("Own Publishing Store");
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(page).toHaveURL(/\/lojas(?:\?|$)/);
  await createOwnProduct(page);
  await page.getByRole("link", { name: "Publish product", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova publicação", exact: true })).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "My products", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(TITLE);
  await expect(page.getByText("Shipped by you", { exact: true })).toBeVisible();
  await expect(page.getByText("Shipped by the supplier", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Publicar em 1 loja", exact: true }).click();
  await expect(page).toHaveURL(/\/publicacoes(?:\?|$)/);
  await expect(
    page.getByText("No ar na Own Publishing Store", { exact: true }).filter({ visible: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Your product", { exact: true })).toBeVisible();
});
