import { expect, test, type Browser, type Page } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { member, tenantProfile, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import {
  ADMIN_USER,
  enableAdminMode,
  fillBillingAddress,
  fillBillingHolder,
  gotoHydrated,
  signIn,
  signUp,
} from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));

const MASKED_ADDRESS = "•••, ••• · São Paulo/SP";
const PHONE_DIGITS = "11987654321";

async function tenantIdOf(email: string): Promise<string> {
  const [row] = await database
    .select({ tenantId: member.organizationId })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(user.email, email))
    .limit(1);
  if (row === undefined) throw new Error(`No tenant for ${email}`);
  return row.tenantId;
}

async function setRole(email: string, role: "agent" | "supervisor") {
  await database.update(user).set({ role }).where(eq(user.email, email));
}

test("asks for the billing address and keeps it hidden behind the eye", async ({ page }) => {
  test.setTimeout(120_000);
  await signUp(page, "Revendedor Endereco");
  await page.getByLabel("Nome completo").fill("Revendedor Endereço Silva");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Informe os 8 números do CEP, como 01310-100")).toBeVisible();
  await expect(page.getByText("Escolha o estado")).toBeVisible();

  await page.getByLabel("CEP").fill("01310100");
  await expect(page.getByLabel("CEP")).toHaveValue("01310-100");
  await page.getByLabel("Número").fill("s/n");
  await fillBillingHolder(page, "Revendedor Endereço Silva");
  await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();

  await gotoHydrated(page, "/onboarding?step=details");
  const address = page.getByTestId("billing-address");
  await expect(address).toHaveText(MASKED_ADDRESS);
  await expect(page.getByText("Avenida Paulista")).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar endereço" }).click();
  await expect(address).toContainText("Avenida Paulista, 1578");
  await expect(address).toContainText("CEP 01310-100");
  await page.getByRole("button", { name: "Ocultar endereço" }).click();
  await expect(address).toHaveText(MASKED_ADDRESS);

  await page.getByRole("button", { name: "Alterar endereço" }).click();
  await page.getByLabel("Número").fill("s/n");
  await page.getByRole("button", { name: "Salvar dados", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dados salvos", exact: true })).toBeVisible();
  await expect(address).toHaveText(MASKED_ADDRESS);
  await page.getByRole("button", { name: "Mostrar endereço" }).click();
  await expect(address).toContainText("Avenida Paulista, s/n");
});

test("an account saved before the address existed is asked for it", async ({ page }) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revendedor Antigo");
  await fillBillingHolder(page, "Revendedor Antigo Souza");
  await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();
  await database
    .update(tenantProfile)
    .set({ billingAddress: null })
    .where(eq(tenantProfile.tenantId, await tenantIdOf(email)));

  await gotoHydrated(page, "/onboarding?step=details");
  await expect(page.getByText("Falta o endereço.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("CEP")).toHaveValue("");
  await page.getByRole("button", { name: "Salvar dados", exact: true }).click();
  await expect(page.getByText("Informe a rua")).toBeVisible();

  await fillBillingAddress(page);
  await page.getByRole("button", { name: "Salvar dados", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dados salvos", exact: true })).toBeVisible();
  await expect(page.getByTestId("billing-address")).toHaveText(MASKED_ADDRESS);
  await expect(page.getByText("Falta o endereço.", { exact: false })).toHaveCount(0);
});

async function openTicketAsReseller(browser: Browser) {
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  const email = await signUp(page, "Revendedor Contato");
  await fillBillingHolder(page, "Revendedor Contato Lima");
  await expect(page.getByText("Etapa 2 de 2 · Fornecedor")).toBeVisible();
  const body = `Loja sem vendas ${Date.now()}`;
  await gotoHydrated(page, "/suporte/novo");
  await page.getByRole("button", { name: /^Pedido ou entrega/ }).click();
  await page.getByRole("button", { name: /^O pedido atrasou/ }).click();
  await page.getByLabel("O que aconteceu com a entrega?").fill(body);
  await page.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(page.getByRole("heading", { name: "O pedido atrasou", exact: true })).toBeVisible();
  await context.close();
  return { email, subject: `O pedido atrasou: ${body}` };
}

/** Opens the ticket in the staff inbox and returns every server response body read meanwhile. */
async function openTicketAsStaff(page: Page, subject: string): Promise<string[]> {
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (!response.url().includes("_serverFn")) return;
    try {
      bodies.push(await response.text());
    } catch {
      // A body dropped by a navigation carries nothing to check.
    }
  });
  await gotoHydrated(page, "/admin/chamados");
  await page.getByLabel("Buscar chamados").fill(subject);
  await expect(page).toHaveURL(/query=/);
  await page.getByRole("link", { name: subject }).click();
  await expect(page.getByRole("heading", { name: "O pedido atrasou", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  return bodies;
}

test("only the admin receives the customer's phone; the team sees the address", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { email, subject } = await openTicketAsReseller(browser);

  const adminContext = await browser.newContext({ locale: "pt-BR" });
  const admin = await adminContext.newPage();
  await signIn(admin, ADMIN_USER);
  await enableAdminMode(admin);
  await openTicketAsStaff(admin, subject);
  const adminPanel = admin.getByRole("complementary", { name: "Contexto do cliente" });
  await expect(adminPanel.getByText("(11) 98765-4321")).toBeVisible();
  await expect(adminPanel.getByTestId("billing-address")).toHaveText(MASKED_ADDRESS);
  await adminPanel.getByRole("button", { name: "Mostrar endereço" }).click();
  await expect(adminPanel.getByTestId("billing-address")).toContainText("Avenida Paulista");

  await gotoHydrated(admin, `/admin/clientes?query=${encodeURIComponent(email)}`);
  await admin.getByRole("button", { name: /^Revendedor Contato/ }).click();
  const quickView = admin.getByRole("region", { name: "Resumo de Revendedor Contato" });
  await expect(quickView.getByText("(11) 98765-4321")).toBeVisible();
  await expect(quickView.getByTestId("billing-address")).toHaveText(MASKED_ADDRESS);
  await adminContext.close();

  for (const role of ["agent", "supervisor"] as const) {
    const staffContext = await browser.newContext({ locale: "pt-BR" });
    const staff = await staffContext.newPage();
    const staffEmail = await signUp(staff, `Equipe ${role}`);
    await setRole(staffEmail, role);
    await gotoHydrated(staff, "/dashboard");
    await enableAdminMode(staff);
    const bodies = await openTicketAsStaff(staff, subject);
    const panel = staff.getByRole("complementary", { name: "Contexto do cliente" });
    await expect(panel.getByTestId("billing-address")).toHaveText(MASKED_ADDRESS);
    await expect(panel.getByText("Telefone", { exact: true })).toHaveCount(0);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body, `${role} never receives the phone`).not.toContain(PHONE_DIGITS);
    }
    await staffContext.close();
  }
});
