import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { member, supplierFlags, suppliers, user } from "@sellbridge/database/schema";
import { applySupplierFlag, revokeSupplierFlag } from "@sellbridge/database/repositories";
import { eq, inArray } from "drizzle-orm";
import {
  ADMIN_USER,
  DEMO_USER,
  enableAdminMode,
  gotoHydrated,
  SIGN_UP_PASSWORD,
  signIn,
  signUp,
  signUpAsSupplier,
} from "./helpers";
import { e2eDatabase } from "./database";

/*
 * MVP function 6: manual supplier flags. Supervisors apply and revoke on the team's flags page,
 * agents only read, the supplier sees its own active flags on the home without who applied them,
 * and nobody outside the team gets the page or its server functions.
 */
const database = e2eDatabase();
const run = Date.now();
const SUPPLIER_NAME = `Ateliê Flags E2E ${run}`;
const OTHER_SUPPLIER_NAME = `Outro Ateliê Flags E2E ${run}`;
const NOTE = "Telefone pessoal na descrição do produto Vaso Azul.";
const REVOKE_NOTE = "Aplicada por engano no fornecedor errado.";
const supplierIds: string[] = [];

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  if (supplierIds.length > 0) {
    await database.delete(suppliers).where(inArray(suppliers.id, supplierIds));
  }
  // The shared Postgres can be short of connections: never wait forever to close ours.
  await database.$client.end({ timeout: 5 });
});

/** Stands in for the brand step: links a new supplier to the account's profile. */
async function giveBrand(email: string, name: string): Promise<string> {
  const [profile] = await database
    .select({ organizationId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (profile === undefined) {
    throw new Error(`Conta de teste sem perfil: ${email}`);
  }
  const [created] = await database
    .insert(suppliers)
    .values({ name, niche: "Casa", state: "SP", city: "Campinas", ...profile })
    .returning({ id: suppliers.id });
  if (created === undefined) {
    throw new Error("fornecedor de teste não criado");
  }
  supplierIds.push(created.id);
  return created.id;
}

/** A fresh account with a team role, signed in again so the session carries the role. */
async function teamMemberPage(browser: Browser, name: string, role: "agent" | "supervisor") {
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  const email = await signUp(page, name);
  await database.update(user).set({ role, emailVerified: true }).where(eq(user.email, email));
  await context.clearCookies();
  await signIn(page, { email, password: SIGN_UP_PASSWORD });
  await enableAdminMode(page);
  return { context, page };
}

interface CapturedCall {
  url: string;
  body: string;
  contentType: string;
}

/** Replays a server function call the page made, from another account's session. */
async function replayStatus(context: BrowserContext, call: CapturedCall): Promise<number> {
  const response = await context.request.post(call.url, {
    data: call.body,
    headers: { "content-type": call.contentType, "x-tsr-serverfn": "true" },
  });
  return response.status();
}

async function captureCall(page: Page, marker: string, act: () => Promise<void>) {
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().includes("/_serverFn/") &&
      (request.postData()?.includes(marker) ?? false),
  );
  await act();
  const request = await requestPromise;
  return {
    url: request.url(),
    body: request.postData() ?? "",
    contentType: request.headers()["content-type"] ?? "application/json",
  };
}

let supplierId = "";
let otherSupplierId = "";
let supplierEmail = "";
let applyCall: CapturedCall | null = null;

test("supervisor aplica uma flag pela página das flags", async ({ browser }) => {
  test.setTimeout(120_000);
  const supplierPage = await browser.newPage();
  supplierEmail = await signUpAsSupplier(supplierPage, SUPPLIER_NAME);
  supplierId = await giveBrand(supplierEmail, SUPPLIER_NAME);
  await supplierPage.close();
  const otherPage = await browser.newPage();
  otherSupplierId = await giveBrand(
    await signUpAsSupplier(otherPage, OTHER_SUPPLIER_NAME),
    OTHER_SUPPLIER_NAME,
  );
  await otherPage.close();

  const { context, page } = await teamMemberPage(browser, "Supervisora Flags", "supervisor");
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}/flags`);
  await expect(page.getByRole("heading", { name: SUPPLIER_NAME, level: 1 })).toBeVisible();
  await expect(page.getByText("Nenhuma flag ativa.")).toBeVisible();
  await expect(page.getByText("0 de 3 em 90 dias")).toBeVisible();

  await page.getByRole("button", { name: "Aplicar flag" }).click();
  const dialog = page.getByRole("dialog", { name: "Aplicar flag" });
  await dialog.getByRole("combobox", { name: "Motivo" }).click();
  await page.getByRole("option", { name: "Outro" }).click();
  await dialog.getByRole("button", { name: "Aplicar flag" }).click();
  await expect(dialog.getByText("explique na observação")).toBeVisible();

  await dialog.getByRole("combobox", { name: "Motivo" }).click();
  await page.getByRole("option", { name: "Tentou passar contato fora da plataforma" }).click();
  await dialog.getByLabel(/Observação/).fill(NOTE);
  applyCall = await captureCall(page, "contact_attempt", async () => {
    await dialog.getByRole("button", { name: "Aplicar flag" }).click();
  });
  await expect(dialog).toBeHidden();
  await expect(page.getByText(NOTE)).toBeVisible();
  await expect(page.getByText("1 de 3 em 90 dias")).toBeVisible();
  await context.close();
});

test("atendente só vê as flags e o servidor recusa a aplicação", async ({ browser }) => {
  if (applyCall === null) throw new Error("a chamada de aplicar não foi capturada");
  const { context, page } = await teamMemberPage(browser, "Atendente Flags", "agent");
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}/flags`);
  await expect(page.getByText(NOTE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Aplicar flag" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retirar flag" })).toHaveCount(0);

  expect(await replayStatus(context, applyCall)).toBe(403);
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}`);
  await expect(page.getByRole("heading", { name: SUPPLIER_NAME, level: 1 })).toHaveCount(0);
  await context.close();
});

test("fornecedor vê o aviso sem saber quem aplicou e não chega às flags da equipe", async ({
  browser,
}) => {
  if (applyCall === null) throw new Error("a chamada de aplicar não foi capturada");
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  await signIn(page, { email: supplierEmail, password: SIGN_UP_PASSWORD });
  const noticeCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/_serverFn/") && request.url().includes(supplierId)) {
      noticeCalls.push(request.url());
    }
  });
  await gotoHydrated(page, "/fornecedor/painel");
  const card = page.getByRole("region", { name: "Avisos da equipe" });
  await expect(card).toContainText("Tentou passar contato fora da plataforma");
  await expect(card).toContainText(NOTE);
  await expect(card).toContainText("1 de 3 em 90 dias");
  await expect(card).toContainText("problema na sua conta de fornecedor");
  await expect(card).not.toContainText("Supervisora Flags");
  const contest = card.getByRole("link", { name: "Discorda? Fale com o suporte" });
  expect(await contest.getAttribute("href")).toContain("categoria=other");

  // Malicious: the team's functions and another supplier's flags are refused.
  expect(await replayStatus(context, applyCall)).toBe(403);
  expect(noticeCalls.length).toBeGreaterThan(0);
  for (const url of noticeCalls) {
    const response = await context.request.get(url.replaceAll(supplierId, otherSupplierId), {
      headers: { "x-tsr-serverfn": "true" },
    });
    expect(response.status()).toBe(403);
  }
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}/flags`);
  await expect(page).not.toHaveURL(/\/flags/);
  await context.close();
});

test("revendedor e visitante sem conta não abrem a página das flags", async ({ browser }) => {
  if (applyCall === null) throw new Error("a chamada de aplicar não foi capturada");
  const anonymous = await browser.newContext({ locale: "pt-BR" });
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto(`/admin/fornecedores/${supplierId}/flags`);
  await expect(anonymousPage).toHaveURL(/\/login/);
  // Without a session the call is refused before it reaches the flags (401 or the origin's 403).
  expect([401, 403]).toContain(await replayStatus(anonymous, applyCall));
  await anonymous.close();

  const seller = await browser.newContext({ locale: "pt-BR" });
  const sellerPage = await seller.newPage();
  await signIn(sellerPage, DEMO_USER);
  await sellerPage.goto(`/admin/fornecedores/${supplierId}/flags`);
  await expect(sellerPage).toHaveURL(/\/dashboard/);
  expect(await replayStatus(seller, applyCall)).toBe(403);
  await seller.close();
});

test("supervisor retira a flag com uma observação e o fornecedor deixa de ver", async ({
  browser,
}) => {
  const { context, page } = await teamMemberPage(browser, "Supervisor Retira", "supervisor");
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}/flags`);
  await page.getByRole("button", { name: "Retirar flag" }).click();
  const dialog = page.getByRole("dialog", { name: "Retirar flag?" });
  await dialog.getByRole("button", { name: "Retirar flag" }).click();
  await expect(dialog.getByText("Conte por que a flag está sendo retirada")).toBeVisible();
  await dialog.getByLabel("Por que retirar?").fill(REVOKE_NOTE);
  await dialog.getByRole("button", { name: "Retirar flag" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Nenhuma flag ativa.")).toBeVisible();
  await page.getByText("Histórico (1)").click();
  await expect(page.getByText(`Motivo da retirada: ${REVOKE_NOTE}`)).toBeVisible();
  await context.close();

  const [flag] = await database
    .select({ revokeNote: supplierFlags.revokeNote })
    .from(supplierFlags)
    .where(eq(supplierFlags.supplierId, supplierId));
  expect(flag?.revokeNote).toBe(REVOKE_NOTE);

  const supplierContext = await browser.newContext({ locale: "pt-BR" });
  const supplierPage = await supplierContext.newPage();
  await signIn(supplierPage, { email: supplierEmail, password: SIGN_UP_PASSWORD });
  await gotoHydrated(supplierPage, "/fornecedor/painel");
  await expect(supplierPage.getByRole("heading", { name: "Painel do fornecedor" })).toBeVisible();
  await expect(supplierPage.getByRole("region", { name: "Avisos da equipe" })).toHaveCount(0);
  await supplierContext.close();
});

test("admin vê as flags na ficha e a ação na auditoria", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}`);
  const section = page.getByRole("region", { name: "Flags" });
  await expect(section.getByRole("button", { name: "Aplicar flag" })).toBeVisible();
  await expect(section.getByText("Histórico (1)")).toBeVisible();

  await gotoHydrated(page, `/admin/auditoria?query=${encodeURIComponent(SUPPLIER_NAME)}`);
  await expect(
    page.getByRole("cell", {
      name: "Aplicou uma flag ao fornecedor: Tentou passar contato fora da plataforma",
    }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Retirou uma flag do fornecedor" })).toBeVisible();
});

test("uma retirada recusada atualiza a lista e não reaparece na próxima flag", async ({
  browser,
}) => {
  const [admin] = await database
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, ADMIN_USER.email));
  if (admin === undefined) throw new Error("admin do seed não encontrado");
  await applySupplierFlag(database, {
    supplierId,
    reason: "stale_catalog",
    note: "",
    createdBy: admin.id,
  });
  const newest = await applySupplierFlag(database, {
    supplierId,
    reason: "slow_support",
    note: "",
    createdBy: admin.id,
  });

  const { context, page } = await teamMemberPage(browser, "Supervisora Atrasada", "supervisor");
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}/flags`);
  await expect(page.getByRole("button", { name: "Retirar flag" })).toHaveCount(2);
  // Another team member revokes the newest flag while this page still shows it.
  await revokeSupplierFlag(database, {
    supplierId,
    flagId: newest.id,
    revokedBy: admin.id,
    revokeNote: "Retirada em outra aba.",
    now: new Date(),
  });

  await page.getByRole("button", { name: "Retirar flag" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Retirar flag?" });
  await dialog.getByLabel("Por que retirar?").fill(REVOKE_NOTE);
  await dialog.getByRole("button", { name: "Retirar flag" }).click();
  await expect(dialog.getByText("Esta flag já foi retirada.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Retirar flag" })).toHaveCount(1);

  await page.getByRole("button", { name: "Retirar flag" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Esta flag já foi retirada.")).toHaveCount(0);
  await context.close();
});
