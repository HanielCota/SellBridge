import { expect, test } from "@playwright/test";
import { user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import {
  enableAdminMode,
  gotoHydrated,
  SIGN_UP_PASSWORD,
  signIn,
  signUp,
  signUpAsSupplier,
} from "./helpers";
import {
  claimTicketId,
  database,
  newPage,
  PHOTO_FIXTURE,
  profileOf,
  returnedOrder,
  supplierWithProduct,
} from "./returns.fixture";

test.afterAll(async () => {
  await database.$client.end();
});

test("a return the supplier disputes reaches the team, which credits the reseller", async ({
  browser,
}) => {
  test.slow();
  const supplierPage = await newPage(browser);
  const supplierEmail = await signUpAsSupplier(supplierPage, "Calçados Franca Devolução");
  const product = await supplierWithProduct(supplierEmail, "Calçados Franca Devolução");

  const resellerPage = await newPage(browser);
  const resellerEmail = await signUp(resellerPage, "Revendedora Devolução");
  const reseller = await profileOf(resellerEmail);
  const order = await returnedOrder(reseller.tenantId, product.id);
  const ticketId = await claimTicketId(order.orderId);

  // The reseller tells why, with a photo: a defect is the supplier's fault.
  await gotoHydrated(resellerPage, `/pedidos/${order.orderId}`);
  const resellerCard = resellerPage.getByRole("region", {
    name: "Devolução · Calçados Franca Devolução",
  });
  await resellerCard.getByLabel("Defeito no produto").check();
  await resellerCard.getByLabel("O que o comprador disse?").fill("A sola descolou no 1º uso.");
  await resellerCard.locator('input[type="file"]').setInputFiles(PHOTO_FIXTURE);
  await resellerCard.getByRole("button", { name: "Enviar motivo" }).click();
  await expect(resellerCard.getByText("O que você contou")).toBeVisible();

  // The supplier answers from its own support area, without the reseller's name, and disagrees.
  await gotoHydrated(supplierPage, `/suporte/${ticketId}`);
  const claimCard = supplierPage.getByRole("region", { name: "Devolução" });
  await expect(claimCard.getByText("Custo pago pelo revendedor: R$ 70,00")).toBeVisible();
  await expect(claimCard.getByText("A sola descolou no 1º uso.")).toBeVisible();
  await expect(supplierPage.getByText("Revendedora Devolução")).toHaveCount(0);
  await claimCard.getByLabel("Não está como o revendedor contou").check();
  await claimCard.getByLabel("O que está diferente?").fill("Voltou com a sola gasta de uso.");
  await claimCard.locator('input[type="file"]').setInputFiles(PHOTO_FIXTURE);
  await claimCard.getByRole("button", { name: "Enviar resposta" }).click();
  await expect(claimCard.getByText("A equipe SellBridge está olhando as fotos")).toBeVisible();

  // A supervisor credits less than the supplier cost.
  const staffEmail = await signUp(await newPage(browser), "Supervisora Devoluções");
  await database.update(user).set({ role: "supervisor" }).where(eq(user.email, staffEmail));
  // A fresh session reads the new role.
  const staffPage = await newPage(browser);
  await signIn(staffPage, { email: staffEmail, password: SIGN_UP_PASSWORD });
  await enableAdminMode(staffPage);
  await gotoHydrated(staffPage, `/admin/chamados/${ticketId}`);
  const decision = staffPage.getByRole("region", { name: "Devolução · crédito do fornecedor" });
  await expect(decision.getByText("Fornecedor discorda do revendedor")).toBeVisible();
  const amount = decision.getByLabel("Valor do crédito ao revendedor");
  await expect(amount).toHaveValue("70,00");
  await amount.fill("90,00");
  await expect(decision.getByText(/O crédito vai até R\$\s70,00/)).toBeVisible();
  await amount.fill("50,00");
  await decision.getByRole("button", { name: "Creditar ao revendedor" }).click();
  await expect(decision.getByText("Equipe SellBridge decidiu")).toBeVisible();
  await expect(decision.getByText(/Fornecedor deve R\$\s50,00 de custo/)).toBeVisible();

  // The reseller sees the credit on the returned order.
  await gotoHydrated(resellerPage, `/pedidos/${order.orderId}`);
  await expect(resellerPage.getByText(/Crédito do fornecedor: R\$\s50,00 creditado/)).toBeVisible();
});
