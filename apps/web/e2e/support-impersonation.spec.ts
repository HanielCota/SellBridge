import { type Browser, type Page, expect, test } from "@playwright/test";
import { member, suppliers, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import {
  ADMIN_USER,
  SIGN_UP_PASSWORD,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
  signUpAsSupplier,
  waitForHydration,
} from "./helpers";

/* MVP item 3: agents and supervisors enter a customer's account only for an open ticket. */
const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

async function userIdOf(email: string): Promise<string> {
  const [row] = await database.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (row === undefined) throw new Error(`Conta ${email} não encontrada`);
  return row.id;
}

/** A fresh account with a team role, signed in again so the session carries the role. */
async function staffPage(browser: Browser, role: "agent" | "supervisor") {
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  const email = await signUp(page, role === "agent" ? "Atendente Visita" : "Supervisor Visita");
  await database.update(user).set({ role }).where(eq(user.email, email));
  await context.clearCookies();
  await signIn(page, { email, password: SIGN_UP_PASSWORD });
  await enableAdminMode(page);
  return { context, page, userId: await userIdOf(email) };
}

/** Opens "Pedido encaminhado › Faltam dados do pedido" and returns the team's ticket path. */
async function openSupplierTicket(page: Page): Promise<string> {
  await gotoHydrated(page, "/suporte/novo");
  await page.getByRole("button", { name: /^Pedido encaminhado/ }).click();
  await page.getByRole("button", { name: /^Faltam dados do pedido/ }).click();
  await page
    .getByLabel("O que está faltando no pedido?")
    .fill(`O pedido ${Date.now()} chegou sem o tamanho do produto.`);
  await page.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(page).toHaveURL(/\/suporte\/[0-9a-f-]{36}/);
  return new URL(page.url()).pathname.replace("/suporte/", "/admin/chamados/");
}

/** The impersonation route called straight from the browser, as a curious agent would. */
async function callImpersonate(page: Page, userId: string) {
  return page.evaluate(async (target) => {
    const response = await fetch("/api/auth/admin/impersonate-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: target }),
    });
    return { status: response.status, body: await response.text() };
  }, userId);
}

/** Account deletion over the API with the right password: refused while inside an account. */
async function tryDeleteAccount(page: Page): Promise<number> {
  return page.evaluate(async (password) => {
    const response = await fetch("/api/auth/delete-user", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return response.status;
  }, SIGN_UP_PASSWORD);
}

test("atendente entra no painel do fornecedor pelo chamado e volta ao chamado", async ({
  browser,
  page,
}) => {
  await signUpAsSupplier(page, `Marca Visita ${Date.now()}`);
  const ticketPath = await openSupplierTicket(page);
  const agent = await staffPage(browser, "agent");

  await gotoHydrated(agent.page, ticketPath);
  await agent.page.getByRole("button", { name: "Entrar como fornecedor" }).click();
  await expect(agent.page).toHaveURL(/\/fornecedor\/painel/);
  const banner = agent.page.getByRole("complementary", { name: "Acesso como cliente" });
  await expect(banner).toBeVisible();

  // Deleting the account stays off during the visit, even straight over the API with the
  // right password: were the block missing, this call would delete the supplier's account.
  expect(await tryDeleteAccount(agent.page)).toBe(403);

  // The panel sends a supplier without a brand on to its brand page: act once that page is live.
  await expect(agent.page).toHaveURL(/\/fornecedor\/painel\/marca/);
  await waitForHydration(agent.page);
  // What the supplier asked for help with: registering the brand, with the orders e-mail left
  // as the account's own, which is all the server allows during a visit.
  await agent.page.getByLabel("Nome da marca").fill("Marca ajustada pelo suporte");
  await agent.page.getByLabel("O que você vende (nicho)").fill("Calçados");
  await agent.page.getByLabel("Cidade de onde você envia").fill("Franca");
  await agent.page.getByRole("button", { name: "Cadastrar marca" }).click();
  await expect(agent.page.getByText("Marca cadastrada")).toBeVisible();
  await banner.getByRole("button", { name: "Voltar ao admin" }).click();
  await expect(agent.page).toHaveURL(new RegExp(ticketPath));
  await agent.context.close();
});

test("atendente não entra sem chamado aberto nem na conta da equipe", async ({ browser }) => {
  const customerContext = await browser.newContext({ locale: "pt-BR" });
  const customerEmail = await signUp(await customerContext.newPage(), "Cliente Sem Chamado");
  const customerId = await userIdOf(customerEmail);
  await customerContext.close();
  const agent = await staffPage(browser, "agent");
  const supervisor = await staffPage(browser, "supervisor");

  const noTicket = await callImpersonate(agent.page, customerId);
  expect(noTicket.status).toBe(403);
  expect(noTicket.body).toContain("chamado aberto");

  const teamAccount = await callImpersonate(agent.page, supervisor.userId);
  expect(teamAccount.status).toBe(403);

  const ownAccount = await callImpersonate(agent.page, agent.userId);
  expect(ownAccount.status).toBe(403);
  await agent.context.close();
  await supervisor.context.close();
});

test("supervisor entra na conta do revendedor e o admin vê a visita na auditoria", async ({
  browser,
  page,
}) => {
  const resellerEmail = await signUp(page, "Revendedor Visita");
  await gotoHydrated(page, "/suporte/novo");
  await page.getByRole("button", { name: /^Pedido ou entrega/ }).click();
  await page.getByRole("button", { name: /^O pedido atrasou/ }).click();
  await page
    .getByLabel("O que aconteceu com a entrega?")
    .fill(`O pedido ${Date.now()} passou da data de entrega.`);
  await page.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(page).toHaveURL(/\/suporte\/[0-9a-f-]{36}/);
  const ticketPath = new URL(page.url()).pathname.replace("/suporte/", "/admin/chamados/");

  const supervisor = await staffPage(browser, "supervisor");
  await gotoHydrated(supervisor.page, ticketPath);
  await supervisor.page.getByRole("button", { name: "Entrar como cliente" }).click();
  await expect(supervisor.page).toHaveURL(/\/dashboard/);
  await expect(
    supervisor.page.getByRole("complementary", { name: "Acesso como cliente" }),
  ).toBeVisible();
  await supervisor.context.close();

  const adminContext = await browser.newContext({ locale: "pt-BR" });
  const admin = await adminContext.newPage();
  await signIn(admin, ADMIN_USER);
  await enableAdminMode(admin);
  await gotoHydrated(admin, `/admin/clientes/${await userIdOf(resellerEmail)}`);
  await expect(admin.getByText(/Entrou como o cliente pelo chamado #[0-9A-F]{6}/)).toBeVisible();
  await adminContext.close();
});

test("admin entra como fornecedor pela ficha do cliente e volta à ficha", async ({
  browser,
  page,
}) => {
  const supplierEmail = await signUpAsSupplier(page, `Fornecedor Ficha ${Date.now()}`);
  const customerPath = `/admin/clientes/${await userIdOf(supplierEmail)}`;

  const adminContext = await browser.newContext({ locale: "pt-BR" });
  const admin = await adminContext.newPage();
  await signIn(admin, ADMIN_USER);
  await enableAdminMode(admin);
  await gotoHydrated(admin, customerPath);
  await admin.getByRole("button", { name: "Entrar como cliente" }).click();

  // A supplier's account opens in its panel, never in the reseller's dashboard.
  await expect(admin).toHaveURL(/\/fornecedor\/painel/);
  const banner = admin.getByRole("complementary", { name: "Acesso como cliente" });
  await expect(banner).toBeVisible();
  expect(await tryDeleteAccount(admin)).toBe(403);

  // The panel sends a supplier without a brand on to its brand page: leave once that page is live.
  await expect(admin).toHaveURL(/\/fornecedor\/painel\/marca/);
  await waitForHydration(admin);
  await banner.getByRole("button", { name: "Voltar ao admin" }).click();
  await expect(admin).toHaveURL(new RegExp(customerPath));
  await expect(admin.getByText("Entrou como o fornecedor").first()).toBeVisible();
  await adminContext.close();
});

test("admin entra como fornecedor pela lista de fornecedores", async ({ browser, page }) => {
  const name = `Marca Lista ${Date.now()}`;
  const supplierEmail = await signUpAsSupplier(page, name);
  const [profile] = await database
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, await userIdOf(supplierEmail)));
  // The supplier row the panel's brand step would create, tied to the account.
  const [supplier] = await database
    .insert(suppliers)
    .values({
      name,
      niche: "Teste",
      state: "SP",
      city: "Campinas",
      organizationId: profile?.organizationId,
    })
    .returning({ id: suppliers.id });

  const adminContext = await browser.newContext({ locale: "pt-BR" });
  const admin = await adminContext.newPage();
  await signIn(admin, ADMIN_USER);
  await enableAdminMode(admin);
  await gotoHydrated(admin, `/admin/fornecedores?query=${encodeURIComponent(name)}`);
  await admin.getByRole("button", { name: `Entrar como fornecedor: ${name}` }).click();
  await expect(admin).toHaveURL(/\/fornecedor\/painel/);
  await expect(admin.getByRole("complementary", { name: "Acesso como cliente" })).toBeVisible();
  await adminContext.close();
  await database.delete(suppliers).where(eq(suppliers.id, supplier?.id ?? ""));
});
