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

async function createProduct(page: Page, sku: string) {
  await gotoHydrated(page, "/products");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("SKU", { exact: true }).fill(sku);
  await page.getByLabel("Product title", { exact: true }).fill("Private cotton home accessory");
  await page.getByLabel("Unit cost (BRL)").fill("12,00");
  await page.getByLabel("Selling price (BRL)").fill("30,00");
  await page.getByLabel("Stock on hand").fill("7");
  await page.getByLabel("Category", { exact: true }).selectOption({ label: "Casa e decoração" });
  await page
    .getByLabel("Upload images", { exact: true })
    .setInputFiles({ name: "product.png", mimeType: "image/png", buffer: PIXEL_PNG });
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("img", { name: "Product view 1" })).toBeVisible();
  await database
    .update(supplierProducts)
    .set({ stock: 5, updatedAt: sql`${supplierProducts.updatedAt}` })
    .where(eq(supplierProducts.id, id));
  await page
    .getByLabel("Description", { exact: true })
    .fill("Updated description after a concurrent sale.");
  await expect(page.getByLabel("Stock on hand")).toHaveValue("5");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Make ready", exact: true }).click();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Archive product", exact: true }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to products", exact: true }).click();
  await page.getByLabel("Product status", { exact: true }).selectOption("archived");
  await expect(page.getByText(sku, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Edit product", exact: true }).click();
  await page.getByRole("button", { name: "Make ready", exact: true }).click();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  await page.getByLabel("SKU for duplicate", { exact: true }).fill(`${sku}-COPY`);
  await page.getByRole("button", { name: "Duplicate as draft", exact: true }).click();
  await expect(page.getByLabel("SKU", { exact: true })).toHaveValue(`${sku}-COPY`);
  await expect(page.getByLabel("Stock on hand")).toHaveValue("0");
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
    await expect(otherPage.getByLabel("Product title", { exact: true })).toHaveValue("");
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
    await adminPage.getByRole("button", { name: "Manage customer product", exact: true }).click();
    await adminPage
      .getByLabel("Product title", { exact: true })
      .fill("Administrator corrected product title");
    await expect(adminPage.getByRole("button", { name: "Save now", exact: true })).toBeDisabled();
    await adminPage
      .getByLabel("Reason for intervention")
      .fill("Corrected the customer product title.");
    await expect(adminPage.getByText("All changes saved", { exact: true })).toBeVisible();
    await expect(
      adminPage
        .getByRole("region", { name: "Product operations and audit history" })
        .getByText("Corrected the customer product title.", { exact: true }),
    ).toBeVisible();
    await adminPage.getByRole("button", { name: "Block product", exact: true }).click();
    await expect(adminPage.getByText("Blocked", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Blocked", { exact: true })).toBeVisible();
    await page.getByLabel("Product title", { exact: true }).fill("Owner corrected blocked product");
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Make ready", exact: true })).toBeDisabled();
  } finally {
    await admin.close();
  }
});

test("the product editor remains usable on a phone", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page, "Mobile Product Customer");
  await createProduct(page, `MOBILE-${Date.now()}`);
  await expect(page.getByLabel("Product title", { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Product title", { exact: true }).fill("Unfinished private accessory");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Back to products", exact: true }).click();
  await expect(page.getByLabel("Product title", { exact: true })).toHaveValue(
    "Unfinished private accessory",
  );
  await page.getByLabel("SKU", { exact: true }).fill(`SAVED-${Date.now()}`);
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to products", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add product", exact: true })).toBeVisible();
});
