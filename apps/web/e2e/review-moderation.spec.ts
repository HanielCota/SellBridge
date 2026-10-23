import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  member,
  orderItems,
  orders,
  storeConnections,
  supplierProducts,
  supplierReviews,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import {
  ADMIN_USER,
  DEMO_USER,
  enableAdminMode,
  gotoHydrated,
  SIGN_UP_PASSWORD,
  signIn,
  signUp,
} from "./helpers";

/*
 * MVP function 4: the comment of a supplier review is read only by moderation (admins and
 * supervisors). Other resellers and the supplier keep the rating and the reasons.
 */
const database = e2eDatabase();
const RUN = Date.now();
const SUPPLIER = `Fornecedor moderação ${RUN}`;
const ORDER = `MOD-${RUN}`;
/** Letters only: a long run of digits reads as a phone number and is removed from comments. */
const RUN_TAG = RUN.toString(36).replace(/\d/g, (digit) => "abcdefghij".charAt(Number(digit)));
const COMMENT = `Atrasou por culpa da transportadora, teste ${RUN_TAG}`;
let supplierId = "";
let orderId = "";
let storeName = "";

async function demoStore(): Promise<{ tenantId: string; id: string; shopName: string }> {
  const [store] = await database
    .select({
      tenantId: storeConnections.tenantId,
      id: storeConnections.id,
      shopName: storeConnections.shopName,
    })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(storeConnections, eq(storeConnections.tenantId, member.organizationId))
    .where(eq(user.email, DEMO_USER.email))
    .limit(1);
  if (store === undefined) {
    throw new Error("A conta demo do seed precisa de uma loja conectada");
  }
  return store;
}

/** A supplier of this run with one delivered order of the demo reseller, already reviewed. */
async function seedReviewedOrder(): Promise<void> {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: SUPPLIER, niche: "Teste", state: "SP", city: "São Paulo" })
    .returning({ id: suppliers.id });
  supplierId = supplier?.id ?? "";
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `MOD-${RUN}`,
      title: "Produto moderado",
      costCents: 1000,
      suggestedPriceCents: 2000,
      stock: 3,
    })
    .returning({ id: supplierProducts.id });
  const store = await demoStore();
  storeName = store.shopName;
  const deliveredAt = new Date(Date.now() - 2 * 86_400_000);
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: store.tenantId,
      storeConnectionId: store.id,
      externalOrderId: ORDER,
      status: "delivered",
      totalCents: 2000,
      orderedAt: deliveredAt,
      deliveredAt,
    })
    .returning({ id: orders.id });
  orderId = order?.id ?? "";
  await database.insert(orderItems).values({
    tenantId: store.tenantId,
    orderId,
    supplierProductId: product?.id ?? null,
    title: "Produto moderado",
    quantity: 1,
    unitPriceCents: 2000,
    unitCostCents: 1000,
    stockState: "consumed",
  });
  await database.insert(supplierReviews).values({
    tenantId: store.tenantId,
    orderId,
    supplierId,
    rating: 2,
    tags: ["dispatch:bad"],
    comment: COMMENT,
  });
}

test.beforeAll(async () => {
  await seedReviewedOrder();
});

test.afterAll(async () => {
  await database.delete(orders).where(eq(orders.id, orderId));
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

/** Every server function answer the page receives, as text, to look for leaks. */
function recordServerAnswers(page: Page): string[] {
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (!response.url().includes("/_serverFn/")) {
      return;
    }
    bodies.push(await response.text().catch(() => ""));
  });
  return bodies;
}

/**
 * Calls a server function URL from inside the signed-in page, as someone typing it in the
 * console would: same origin, so the CSRF guard lets it through and only the permission decides.
 */
async function callFromPage(page: Page, url: string): Promise<{ status: number; body: string }> {
  return page.evaluate(async (target) => {
    const response = await fetch(target);
    return { status: response.status, body: await response.text() };
  }, url);
}

/** A fresh account given a team role straight in the database. */
async function teamPage(browser: Browser, role: "agent" | "supervisor") {
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  const email = await signUp(
    page,
    role === "agent" ? "Atendente Moderação" : "Supervisor Moderação",
  );
  await database.update(user).set({ role }).where(eq(user.email, email));
  // A new session, so the role just set is the one the server reads.
  await context.clearCookies();
  await signIn(page, { email, password: SIGN_UP_PASSWORD });
  return { context, page };
}

test("o revendedor vê a nota e os motivos, mas nunca o comentário", async ({ page }) => {
  const answers = recordServerAnswers(page);
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/fornecedores/${supplierId}`);
  const panel = page.getByRole("region", { name: "Reputação do fornecedor" });
  await expect(panel.getByText("Prazo de despacho")).toBeVisible();
  await expect(page.getByText("O que outros revendedores disseram")).toHaveCount(0);
  // Neither the server-rendered page nor any server function answer carries the comment.
  expect(await page.content()).not.toContain(COMMENT);
  await page.reload({ waitUntil: "networkidle" });
  expect(answers.join("\n")).not.toContain(COMMENT);
  expect(await page.content()).not.toContain(COMMENT);
});

test("o diálogo de avaliação diz que só a equipe lê o comentário", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/pedidos");
  await page.getByRole("button", { name: "Avaliações", exact: true }).click();
  await page.getByRole("button", { name: "Avaliados", exact: true }).click();
  await page.getByLabel("Buscar pedido").fill(ORDER);
  const reviewed = page.getByRole("listitem").filter({ hasText: ORDER });
  await reviewed.getByRole("button", { name: /Editar avaliação/ }).click();
  const dialog = page.getByRole("dialog", { name: "Como foi o fornecedor neste pedido?" });
  // The author still finds their own comment when editing the review.
  await expect(dialog.getByLabel("Comentário (opcional)")).toHaveValue(COMMENT);
  await expect(
    dialog.getByText(
      "Só a equipe SellBridge lê este comentário. Conte o que aconteceu com o pedido.",
    ),
  ).toBeVisible();
  await expect(dialog.getByText(/Ajuda outros revendedores/)).toHaveCount(0);
  await expect(dialog.getByText(/Aparece sem o nome da sua loja/)).toHaveCount(0);
});

test("o admin lê o comentário; o atendente é recusado e o supervisor lê, no servidor", async ({
  page,
  browser,
}) => {
  let reviewsCall = "";
  page.on("response", async (response) => {
    const text = await response.text().catch(() => "");
    if (response.url().includes("/_serverFn/") && text.includes(COMMENT)) {
      reviewsCall = response.url();
    }
  });
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/fornecedores/${supplierId}`);
  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Avaliações dos revendedores" }) });
  await expect(section.getByText(COMMENT)).toBeVisible();
  await expect(section.getByText(`${storeName} · pedido ${ORDER}`)).toBeVisible();
  await expect(section.getByText("Nota 2 de 5")).toBeVisible();
  await expect(section.getByText("Atrasou o despacho")).toBeVisible();
  await expect.poll(() => reviewsCall).not.toBe("");

  // Replaying the admin's call from other accounts' own pages: the server decides, not the screen.
  const agent = await teamPage(browser, "agent");
  const refused = await callFromPage(agent.page, reviewsCall);
  expect(refused.status).toBe(403);
  expect(refused.body).not.toContain(COMMENT);
  await agent.context.close();

  const supervisor = await teamPage(browser, "supervisor");
  const allowed = await callFromPage(supervisor.page, reviewsCall);
  expect(allowed.status).toBe(200);
  expect(allowed.body).toContain(COMMENT);
  await supervisor.context.close();

  const reseller = await browser.newContext({ locale: "pt-BR" });
  const resellerPage = await reseller.newPage();
  await signIn(resellerPage, DEMO_USER);
  const asReseller = await callFromPage(resellerPage, reviewsCall);
  expect(asReseller.status).toBe(403);
  expect(asReseller.body).not.toContain(COMMENT);
  await reseller.close();
});

/** Opens the account menu and says whether the team's "Avaliações" item is in it. */
async function menuHasReviews(page: Page): Promise<boolean> {
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  const found = await page.getByRole("menuitem", { name: "Avaliações" }).count();
  await page.keyboard.press("Escape");
  return found > 0;
}

test("o supervisor abre Avaliações pelo menu e lê os comentários de todos os fornecedores", async ({
  browser,
}) => {
  const supervisor = await teamPage(browser, "supervisor");
  const { page } = supervisor;
  let listCall = "";
  page.on("response", async (response) => {
    const text = await response.text().catch(() => "");
    if (response.url().includes("/_serverFn/") && text.includes(COMMENT)) {
      listCall = response.url();
    }
  });
  await enableAdminMode(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Avaliações" }).click();
  await expect(page).toHaveURL(/\/admin\/avaliacoes/);
  await expect(page.getByRole("heading", { name: "Avaliações", level: 1 })).toBeVisible();

  // "Só com comentário" starts on, and the review names the supplier, the store and the order.
  await expect(page.getByLabel("Só com comentário")).toBeChecked();
  const list = page.getByRole("region", { name: "Avaliações dos revendedores" });
  const review = list.getByRole("listitem").filter({ hasText: COMMENT });
  await expect(review.getByText(SUPPLIER)).toBeVisible();
  await expect(review.getByText(`${storeName} · pedido ${ORDER}`)).toBeVisible();
  await expect(review.getByText("Atrasou o despacho")).toBeVisible();
  await expect.poll(() => listCall).not.toBe("");

  // The box follows the address, which changes once the navigation settles.
  await page.getByLabel("Só com comentário").click();
  await expect(page).toHaveURL(/withComment=false/);
  await expect(page.getByLabel("Só com comentário")).not.toBeChecked();

  // The agent: no menu item, the address sends them to the inbox, the function answers 403.
  const agent = await teamPage(browser, "agent");
  await enableAdminMode(agent.page);
  expect(await menuHasReviews(agent.page)).toBe(false);
  await gotoHydrated(agent.page, "/admin/avaliacoes");
  await expect(agent.page).toHaveURL(/\/admin\/chamados/);
  const refused = await callFromPage(agent.page, listCall);
  expect(refused.status).toBe(403);
  expect(refused.body).not.toContain(COMMENT);
  await agent.context.close();
  await supervisor.context.close();
});
