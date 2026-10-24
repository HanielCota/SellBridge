import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import {
  adminAuditEvents,
  member,
  storeConnections,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { enableAdminMode, gotoHydrated, SIGN_UP_PASSWORD, signIn, signUp } from "./helpers";
import { supplierAccounts } from "./supplier-accounts";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const accounts = supplierAccounts(database);
const PHONE_REFUSED = /telefone, e-mail, WhatsApp e redes sociais não podem ser enviados/;

test.afterAll(async () => {
  await accounts.removeAll();
  await database.$client.end();
});

async function profileOf(email: string): Promise<{ userId: string; tenantId: string }> {
  const [row] = await database
    .select({ userId: user.id, tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (row === undefined) throw new Error(`Conta de teste sem perfil: ${email}`);
  return row;
}

/** The brand the supplier panel would create for this account. */
async function brandOf(email: string, name: string): Promise<string> {
  const { tenantId } = await profileOf(email);
  const [supplier] = await database
    .insert(suppliers)
    .values({ name, niche: "Calçados", state: "SP", city: "Franca", organizationId: tenantId })
    .returning({ id: suppliers.id });
  if (supplier === undefined) throw new Error("Fornecedor não criado");
  return supplier.id;
}

/** A connected store selling that brand, as the store page would leave it. */
async function storeSelling(tenantId: string, supplierId: string, shopName: string) {
  await database.insert(storeConnections).values({
    tenantId,
    marketplace: "mock",
    externalShopId: randomUUID(),
    shopName,
    supplierId,
  });
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "pt-BR" });
  return context.newPage();
}

test("a store writes to its supplier from Suporte, the supplier answers and the team reads it", async ({
  browser,
}) => {
  test.slow();
  const suffix = randomUUID().slice(0, 6);
  const brandName = `Calçados Franca ${suffix}`;
  const storeName = `Loja Conversa ${suffix}`;
  const supplierPage = await newPage(browser);
  const supplierEmail = await accounts.signUp(supplierPage, brandName);
  const supplierId = await brandOf(supplierEmail, brandName);

  const resellerPage = await newPage(browser);
  const resellerEmail = await signUp(resellerPage, "Revendedora Conversa");
  const reseller = await profileOf(resellerEmail);
  await storeSelling(reseller.tenantId, supplierId, storeName);

  // From the "Suporte" card: store (its supplier comes with it), topic, situation, message.
  await gotoHydrated(resellerPage, "/pedidos");
  await resellerPage.getByRole("button", { name: "Suporte" }).click();
  await resellerPage.getByRole("link", { name: /Falar com um fornecedor/ }).click();
  await resellerPage.getByRole("button", { name: new RegExp(storeName) }).click();
  await resellerPage.getByRole("button", { name: /^Pedido/ }).click();
  await resellerPage.getByRole("button", { name: /O pedido está atrasado/ }).click();
  await resellerPage
    .getByRole("textbox", { name: "Desde quando o pedido espera o envio?" })
    .fill("O pedido foi pago na segunda e ainda não tem rastreio.");
  await resellerPage.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(resellerPage).toHaveURL(/\/suporte\/conversas\//);
  await expect(resellerPage.getByText("Aguardando o fornecedor.")).toBeVisible();

  // A phone number is refused on the server and audited, never saved.
  await resellerPage.getByLabel("Sua resposta").fill("Me liga no 11 98765-4321 para combinar");
  await resellerPage.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(resellerPage.getByText(PHONE_REFUSED)).toBeVisible();
  const audits = await database
    .select({ id: adminAuditEvents.id })
    .from(adminAuditEvents)
    .where(
      and(
        eq(adminAuditEvents.userId, reseller.userId),
        eq(adminAuditEvents.action, "contact_blocked"),
      ),
    );
  expect(audits).toHaveLength(1);

  // The supplier finds it in "Revendedores", with the store's name, and answers.
  await gotoHydrated(supplierPage, "/suporte/revendedores");
  const row = supplierPage.getByRole("link", { name: "O pedido está atrasado" });
  await expect(
    supplierPage.getByText(new RegExp(storeName)).filter({ visible: true }),
  ).toBeVisible();
  await row.filter({ visible: true }).click();
  await expect(supplierPage.getByText("O pedido foi pago na segunda")).toBeVisible();
  await expect(supplierPage.getByText(resellerEmail)).toHaveCount(0);
  await supplierPage
    .getByLabel("Sua resposta")
    .fill("Postamos hoje à tarde, o rastreio sai amanhã.");
  await supplierPage.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(supplierPage.getByText("Postamos hoje à tarde")).toBeVisible();

  // The store reads the answer under the brand's name.
  await resellerPage.reload();
  await expect(resellerPage.getByText("Postamos hoje à tarde")).toBeVisible();
  await expect(resellerPage.getByText("O fornecedor respondeu.")).toBeVisible();
  const conversationUrl = new URL(resellerPage.url()).pathname;
  const ticketId = conversationUrl.split("/").at(-1) ?? "";

  // The team reads the conversation from its inbox, without a reply box.
  const staffEmail = await signUp(await newPage(browser), "Supervisora Conversas");
  await database.update(user).set({ role: "supervisor" }).where(eq(user.email, staffEmail));
  const staffPage = await newPage(browser);
  await signIn(staffPage, { email: staffEmail, password: SIGN_UP_PASSWORD });
  await enableAdminMode(staffPage);
  await gotoHydrated(staffPage, "/admin/chamados?queue=suppliers");
  await expect(staffPage.getByText(`Para ${brandName}`).first()).toBeVisible();
  await gotoHydrated(staffPage, `/admin/chamados/${ticketId}`);
  await expect(staffPage.getByText("Conversa entre revendedor e fornecedor.")).toBeVisible();
  await expect(staffPage.getByText("Postamos hoje à tarde")).toBeVisible();
  await expect(staffPage.getByRole("textbox")).toHaveCount(0);
});
