import { expect, test, type Browser } from "@playwright/test";
import { supplierProducts } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { gotoHydrated, signUp, signUpAsSupplier } from "./helpers";
import {
  claimTicketId,
  database,
  newPage,
  profileOf,
  returnedOrder,
  supplierWithProduct,
} from "./returns.fixture";

/** What `supplierWithProduct` puts on the shelf before the sale. */
const SHELF_UNITS = 10;

test.afterAll(async () => {
  await database.$client.end();
});

async function shelfUnits(productId: string): Promise<number> {
  const [row] = await database
    .select({ stock: supplierProducts.stock })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productId));
  return row?.stock ?? Number.NaN;
}

async function returnScenario(browser: Browser, name: string) {
  const supplierPage = await newPage(browser);
  const supplierEmail = await signUpAsSupplier(supplierPage, name);
  const product = await supplierWithProduct(supplierEmail, name);
  const resellerPage = await newPage(browser);
  const reseller = await profileOf(await signUp(resellerPage, `Revenda ${name}`));
  const order = await returnedOrder(reseller.tenantId, product.id, { shipped: true });
  const ticketId = await claimTicketId(order.orderId);
  return { supplierPage, resellerPage, product, order, ticketId };
}

test("the supplier confirms the reseller's reason in time and the units go back on sale", async ({
  browser,
}) => {
  test.slow();
  const { supplierPage, resellerPage, product, order, ticketId } = await returnScenario(
    browser,
    "Calçados Confirma",
  );

  await gotoHydrated(resellerPage, `/pedidos/${order.orderId}`);
  const resellerCard = resellerPage.getByRole("region", { name: "Devolução · Calçados Confirma" });
  await resellerCard.getByLabel("O comprador desistiu").check();
  await resellerCard.getByLabel(/Quanto o Mercado Livre cobrou/).fill("2290");
  await resellerCard.getByRole("button", { name: "Enviar motivo" }).click();
  await expect(resellerCard.getByText("O que você contou")).toBeVisible();

  await gotoHydrated(supplierPage, `/suporte/${ticketId}`);
  const claimCard = supplierPage.getByRole("region", { name: "Devolução" });
  await expect(claimCard.getByText(/Fornecedor conferindo · até/)).toBeVisible();
  await expect(claimCard.getByText("O comprador desistiu")).toBeVisible();
  await claimCard.getByLabel("Está como o revendedor contou", { exact: true }).check();
  await expect(claimCard.getByLabel("Sim, volta para o meu estoque")).toBeChecked();
  await claimCard.getByRole("button", { name: "Enviar resposta" }).click();
  await expect(claimCard.getByText("Fornecedor confirmou")).toBeVisible();
  await expect(claimCard.getByText("O estoque do fornecedor voltou para venda.")).toBeVisible();
  expect(await shelfUnits(product.id)).toBe(SHELF_UNITS);

  // The buyer gave up: the supplier owes the cost, the return label stays with the reseller.
  await gotoHydrated(resellerPage, `/pedidos/${order.orderId}`);
  await expect(resellerCard.getByText(/Fornecedor deve R\$\s70,00 de custo\./)).toBeVisible();
});

test("a parcel that came back to the reseller is sent on and the supplier's clock starts on arrival", async ({
  browser,
}) => {
  test.slow();
  const { supplierPage, resellerPage, order, ticketId } = await returnScenario(
    browser,
    "Calçados Reenvio",
  );

  await gotoHydrated(resellerPage, `/pedidos/${order.orderId}`);
  const resellerCard = resellerPage.getByRole("region", { name: "Devolução · Calçados Reenvio" });
  await resellerCard.getByRole("button", { name: "O pacote voltou para mim" }).click();
  await expect(resellerCard.getByText(/Reenvie o pacote ao fornecedor até/)).toBeVisible();
  await resellerCard.getByLabel("Código de rastreio do reenvio").fill("BR123456789BR");
  await resellerCard.getByRole("button", { name: "Registrar reenvio" }).click();
  await expect(resellerCard.getByText("A caminho do fornecedor")).toBeVisible();

  await gotoHydrated(supplierPage, `/suporte/${ticketId}`);
  const claimCard = supplierPage.getByRole("region", { name: "Devolução" });
  await expect(claimCard.getByText("BR123456789BR")).toBeVisible();
  await claimCard.getByRole("button", { name: "Recebi o pacote" }).click();
  await expect(claimCard.getByText(/Confira o produto e responda até/)).toBeVisible();
});
