import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  member,
  storeConnections,
  storeSuppliers,
  ticketMessages,
  tickets,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { gotoHydrated, signUp } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const HOUR_MILLISECONDS = 3_600_000;

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
  if (row === undefined) throw new Error(`Test account without a profile: ${email}`);
  return row;
}

async function storeSelling(tenantId: string, supplierId: string, shopName: string) {
  const [store] = await database
    .insert(storeConnections)
    .values({ tenantId, marketplace: "mock", externalShopId: randomUUID(), shopName })
    .returning({ id: storeConnections.id });
  if (store === undefined) throw new Error("Store missing");
  await database.insert(storeSuppliers).values({ storeConnectionId: store.id, supplierId });
  return store.id;
}

/** A conversation the store opened two hours ago; `answered` when the supplier already replied. */
async function conversation(input: {
  reseller: { userId: string; tenantId: string };
  supplierId: string;
  storeId: string;
  topic: "cancellation" | "order";
  subject: string;
  answered: boolean;
}) {
  const createdAt = new Date(Date.now() - 2 * HOUR_MILLISECONDS);
  const [ticket] = await database
    .insert(tickets)
    .values({
      tenantId: input.reseller.tenantId,
      createdById: input.reseller.userId,
      subject: input.subject,
      status: input.answered ? "answered" : "open",
      category: "order",
      audience: "supplier",
      supplierId: input.supplierId,
      supplierTopic: input.topic,
      storeConnectionId: input.storeId,
      awaitingSince: input.answered ? null : createdAt,
      firstResponseAt: input.answered ? new Date(createdAt.getTime() + HOUR_MILLISECONDS) : null,
      createdAt,
      updatedAt: createdAt,
    })
    .returning({ id: tickets.id });
  if (ticket === undefined) throw new Error("Conversation missing");
  await database.insert(ticketMessages).values({
    ticketId: ticket.id,
    authorId: input.reseller.userId,
    body: "O comprador pediu para cancelar a compra hoje de manhã.",
    createdAt,
  });
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "pt-BR" });
  return context.newPage();
}

test("the supplier narrows its queue by topic and reads how it answers the stores", async ({
  browser,
}) => {
  test.slow();
  const suffix = randomUUID().slice(0, 6);
  const brandName = `Bolsas Relatório ${suffix}`;
  const supplierPage = await newPage(browser);
  const supplierEmail = await accounts.signUp(supplierPage, brandName);
  const supplierId = await giveTestBrand(database, supplierEmail, brandName);
  const resellerPage = await newPage(browser);
  const reseller = await profileOf(await signUp(resellerPage, "Revendedora Relatório"));
  const storeId = await storeSelling(reseller.tenantId, supplierId, `Loja Relatório ${suffix}`);
  const base = { reseller, supplierId, storeId };
  await conversation({
    ...base,
    topic: "cancellation",
    subject: "Cancelou antes do envio",
    answered: false,
  });
  await conversation({
    ...base,
    topic: "order",
    subject: "O pedido está atrasado",
    answered: false,
  });
  await conversation({ ...base, topic: "order", subject: "O pedido não chegou", answered: true });

  // The topic narrows the list and the tab counts, and stays in the address.
  await gotoHydrated(supplierPage, "/suporte/revendedores");
  const tabs = supplierPage.getByRole("group", { name: "Situação das conversas" });
  await expect(tabs.getByRole("button", { name: /A fazer\s*2/ })).toBeVisible();
  await supplierPage.getByRole("combobox", { name: "Assunto" }).click();
  await supplierPage.getByRole("option", { name: "Cancelamento" }).click();
  await expect(supplierPage).toHaveURL(/assunto=cancellation/);
  await expect(tabs.getByRole("button", { name: /A fazer\s*1/ })).toBeVisible();
  await expect(
    supplierPage.getByRole("link", { name: "Cancelou antes do envio" }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    supplierPage.getByRole("link", { name: "O pedido está atrasado" }).filter({ visible: true }),
  ).toHaveCount(0);

  // The report: what waits now, the period's figures and the topics.
  await supplierPage.getByRole("link", { name: "Ver relatório" }).click();
  await expect(supplierPage).toHaveURL(/\/suporte\/revendedores\/relatorio/);
  await expect(
    supplierPage.getByRole("heading", { name: "2 conversas esperam sua resposta" }),
  ).toBeVisible();
  const figures = supplierPage.getByRole("region", { name: "Números dos últimos 30 dias" });
  await expect(figures.getByText("Recebidas")).toBeVisible();
  await expect(figures.getByText("1h", { exact: true })).toBeVisible();

  await supplierPage.getByRole("button", { name: "7 dias", exact: true }).click();
  await expect(supplierPage).toHaveURL(/dias=7/);
  await expect(
    supplierPage.getByRole("region", { name: "Números dos últimos 7 dias" }),
  ).toBeVisible();

  // A topic of the table opens the queue already narrowed to it.
  await supplierPage
    .getByRole("link", { name: "Pedido", exact: true })
    .filter({ visible: true })
    .click();
  await expect(supplierPage).toHaveURL(/\/suporte\/revendedores\?.*assunto=order/);
  await expect(tabs.getByRole("button", { name: /A fazer\s*1/ })).toBeVisible();

  // A store has no report: it goes back to its own conversations.
  await gotoHydrated(resellerPage, "/suporte/revendedores/relatorio");
  await expect(resellerPage).toHaveURL(/\/suporte\/fornecedores/);
});
