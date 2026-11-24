import { expect, type Page, test } from "@playwright/test";
import { createListingWithTargets, markTargetPublished } from "@sellbridge/database/repositories";
import {
  buyerQuestions,
  member,
  storeConnections,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { completeOnboarding, gotoHydrated, signUp, waitForHydration } from "./helpers";
import { STAND_IN_ELSEWHERE_ANSWER, standInQuestionId } from "./mercado-livre.fixture";

/*
 * A reseller answers the buyers' questions on its Mercado Livre publications in "Perguntas". The
 * web server publishes the answers on the stand-in in mercado-livre.fixture.ts, never on the real
 * Mercado Livre; the questions are stored as the worker would after a notification.
 */
const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

async function tenantOf(email: string): Promise<string> {
  const [seller] = await database
    .select({ tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);
  if (seller === undefined) {
    throw new Error("Conta nova sem organização no banco de teste");
  }
  return seller.tenantId;
}

async function connectStore(page: Page, shopName: string): Promise<void> {
  await page.getByRole("link", { name: "Conectar Mercado Livre" }).click();
  await expect(page.getByRole("heading", { name: "Autorizar o SellBridge" })).toBeVisible();
  await waitForHydration(page);
  await page.getByLabel("Nome da loja").fill(shopName);
  await page.getByRole("button", { name: "Autorizar acesso" }).click();
  await expect(
    page.getByText(`Loja "${shopName}" conectada`).filter({ visible: true }),
  ).toBeVisible({ timeout: 20_000 });
}

/** A product of the onboarding supplier, published on the store under `itemId`. */
async function publishOnStore(input: { tenantId: string; storeId: string; itemId: string }) {
  const [product] = await database
    .select({ id: supplierProducts.id })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(eq(suppliers.name, "BH Beauty Distribuidora"))
    .limit(1);
  if (product === undefined) {
    throw new Error("Produto do fornecedor da semente não encontrado");
  }
  const created = await createListingWithTargets(
    database,
    input.tenantId,
    {
      supplierProductId: product.id,
      title: "Sérum facial vitamina C 30 ml",
      description: "Descrição",
      priceCents: 5990,
    },
    [input.storeId],
  );
  const [targetId] = created.targetIds;
  if (targetId === undefined) {
    throw new Error("Publicação de teste não criada");
  }
  await markTargetPublished(database, targetId, { externalId: input.itemId, externalUrl: null });
  return targetId;
}

const HOUR = 60 * 60 * 1000;

test("a reseller answers a buyer's question once, and learns when it was answered elsewhere", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await signUp(page, "Revendedora Perguntas");
  await completeOnboarding(page);
  await expect(page).toHaveURL(/\/lojas/);
  const shopName = `Loja Perguntas E2E ${Date.now()}`;
  await connectStore(page, shopName);

  const tenantId = await tenantOf(email);
  // A seller id of 9 digits, new on every run: the stand-in answers as this seller.
  const sellerId = `7709${String(Date.now()).slice(-5)}`;
  const [store] = await database
    .update(storeConnections)
    .set({ externalShopId: sellerId, marketplace: "mercado_livre" })
    .where(and(eq(storeConnections.tenantId, tenantId), eq(storeConnections.shopName, shopName)))
    .returning({ id: storeConnections.id });
  if (store === undefined) {
    throw new Error("Loja conectada não encontrada");
  }
  const itemId = `MLB${sellerId}`;
  const listingTargetId = await publishOnStore({ tenantId, storeId: store.id, itemId });
  const base = {
    tenantId,
    storeConnectionId: store.id,
    listingTargetId,
    marketplace: "mercado_livre" as const,
    externalItemId: itemId,
    status: "unanswered" as const,
  };
  await database.insert(buyerQuestions).values([
    {
      ...base,
      externalQuestionId: standInQuestionId(sellerId, "001"),
      text: "Serve para pele oleosa?",
      askedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
    {
      ...base,
      externalQuestionId: standInQuestionId(sellerId, "901"),
      text: "Tem validade longa?",
      askedAt: new Date(Date.now() - 30 * HOUR),
    },
  ]);

  await gotoHydrated(page, "/perguntas");
  const fresh = page.getByRole("article").filter({ hasText: "Serve para pele oleosa?" });
  const late = page.getByRole("article").filter({ hasText: "Tem validade longa?" });
  await expect(fresh.getByText(/^Nova · /)).toBeVisible();
  await expect(late.getByText(/^Atrasada · /)).toBeVisible();

  // Two quick clicks publish one answer: the second finds the question already sending.
  await fresh.getByLabel("Sua resposta").fill("Serve sim, é oil free.");
  await fresh.getByRole("button", { name: "Responder" }).dblclick();
  await expect(page.getByText("Resposta publicada no Mercado Livre.")).toBeVisible();
  await expect(fresh).toHaveCount(0);
  await expect(page.getByText("já está sendo enviada")).toHaveCount(0);

  await late.getByLabel("Sua resposta").fill("Validade de 2 anos.");
  await late.getByRole("button", { name: "Responder" }).click();
  await expect(late.getByText("Esta pergunta já foi respondida.")).toBeVisible();
  await expect(late.getByLabel("Sua resposta")).toHaveValue("Validade de 2 anos.");

  await page.getByRole("button", { name: "Respondidas" }).click();
  const answered = page.getByRole("article").filter({ hasText: "Serve para pele oleosa?" });
  await expect(answered.getByText("Sua resposta, enviada pelo SellBridge")).toBeVisible();
  await expect(answered.getByText("Serve sim, é oil free.")).toBeVisible();
  const elsewhere = page.getByRole("article").filter({ hasText: "Tem validade longa?" });
  await expect(elsewhere.getByText("Resposta dada no Mercado Livre")).toBeVisible();
  await expect(elsewhere.getByText(STAND_IN_ELSEWHERE_ANSWER)).toBeVisible();

  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `page overflows at ${width}px`).toBeLessThanOrEqual(0);
  }
});
