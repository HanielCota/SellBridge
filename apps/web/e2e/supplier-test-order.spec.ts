import { expect, type Page, test } from "@playwright/test";
import { requireEnvironmentVariable } from "./environment";
import { gotoHydrated, signIn } from "./helpers";

const SUPPLIER = {
  email: "fornecedor@sellbridge.local",
  password: requireEnvironmentVariable("SEED_DEMO_PASSWORD"),
};
const ORDERS_PAGE = "/fornecedor/painel/pedidos";

// One supplier account holds one test order at a time: these tests take turns.
test.describe.configure({ mode: "serial" });

function testOrderCard(page: Page) {
  return page.getByRole("region", { name: "Pedido de teste" });
}

/** Starts from no test order, whatever an earlier run left behind. */
async function clearTestOrder(page: Page) {
  const remove = testOrderCard(page).getByRole("button", { name: "Apagar pedido de teste" });
  if (await remove.isVisible()) {
    await remove.click();
    await expect(testOrderCard(page).getByText("Quer ver como um pedido anda?")).toBeVisible();
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page, SUPPLIER);
  await gotoHydrated(page, ORDERS_PAGE);
  await expect(testOrderCard(page)).toBeVisible();
  await clearTestOrder(page);
});

test("walks a test order from received to delivered and deletes it", async ({ page }) => {
  const card = testOrderCard(page);

  await card.getByRole("button", { name: "Criar pedido de teste" }).click();
  await expect(card.getByText("Pedido de teste", { exact: true })).toBeVisible();
  await expect(card.getByText(/Postar até/)).toBeVisible();

  await card.getByRole("button", { name: "Aceitar pedido" }).click();
  await card.getByRole("button", { name: "Imprimir etiqueta de teste" }).click();
  const label = page.getByRole("dialog", { name: "Etiqueta de teste" });
  await expect(label.getByText("NÃO VALE PARA ENVIO")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(label).toBeHidden();
  await card.getByRole("button", { name: "Marcar como separado" }).click();
  await card.getByRole("button", { name: "Marcar como enviado" }).click();
  await expect(card.getByText(/Postar até/)).toBeHidden();
  await card.getByRole("button", { name: "Marcar como entregue" }).click();

  await expect(card.getByText("Pronto: é assim que um pedido de verdade anda.")).toBeVisible();
  await card.getByRole("button", { name: "Apagar pedido de teste" }).click();
  await expect(card.getByRole("button", { name: "Criar pedido de teste" })).toBeVisible();
});

test("keeps the test order out of the real order queue", async ({ page }) => {
  const card = testOrderCard(page);

  await card.getByRole("button", { name: "Criar pedido de teste" }).click();
  await expect(card.getByText("Pedido de teste", { exact: true })).toBeVisible();
  await page.reload();

  await expect(page.getByText("Comprador de teste")).toHaveCount(1);
  await expect(page.locator("table").getByText("Pedido de teste")).toHaveCount(0);
});
