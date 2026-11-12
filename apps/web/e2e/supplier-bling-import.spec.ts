import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  erpCatalogReads,
  supplierErpConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { gotoHydrated } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const run = crypto.randomUUID().slice(0, 8).toUpperCase();
const EXISTING_SKU = `E2E-BLING-JA-${run}`;
const NEW_SKU_1 = `E2E-BLING-N1-${run}`;
const NEW_SKU_2 = `E2E-BLING-N2-${run}`;

test.afterAll(async () => {
  await accounts.removeAll();
  await database.$client.end();
});

/** A Bling account already authorized: no request ever reaches Bling in these specs. */
async function seedConnection(supplierId: string) {
  await database.insert(supplierErpConnections).values({
    supplierId,
    provider: "bling",
    accessTokenEnc: "e2e-not-a-token",
    refreshTokenEnc: "e2e-not-a-token",
    expiresAt: new Date(Date.now() + 6 * 3600_000),
    status: "connected",
  });
}

function catalogItem(sku: string, title: string, priceCents: number) {
  return {
    sku,
    title,
    description: "",
    priceCents,
    stock: 10,
    imageUrls: [],
    brand: null,
    gtin: null,
    weightGrams: 600,
    fiscal: { ncm: "94049000", origin: 0, unit: "UN", cest: null },
  };
}

/** A finished catalog read, as the worker leaves it after reading Bling. */
async function seedFinishedRead(supplierId: string) {
  await database.insert(erpCatalogReads).values({
    supplierId,
    provider: "bling",
    status: "ready",
    totalProducts: 3,
    readProducts: 3,
    finishedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
    result: {
      items: [
        catalogItem(EXISTING_SKU, "Travesseiro Eco-Pluma", 3990),
        catalogItem(NEW_SKU_1, "Kit 2 Travesseiros Eco-Pluma", 3990),
        catalogItem(NEW_SKU_2, "Babuche Nuvem Marinho 33/34", 6990),
      ],
      skipped: [],
      truncated: false,
    },
  });
}

async function supplierWithBrand(page: Parameters<typeof accounts.signUp>[0], name: string) {
  const email = await accounts.signUp(page, name);
  return giveTestBrand(database, email, name);
}

test("sem Bling conectado, o fornecedor vê um botão para conectar e a planilha logo abaixo", async ({
  page,
}) => {
  const supplierId = await supplierWithBrand(page, `Ateliê Sem Bling ${run}`);

  await gotoHydrated(page, "/fornecedor/painel/importar");

  await expect(page.getByRole("heading", { level: 1, name: "Importar produtos" })).toBeVisible();
  const card = page.getByRole("region", { name: "Importar do Bling" });
  await expect(
    card.getByText("O SellBridge só lê: nada muda no seu Bling.", { exact: false }),
  ).toBeVisible();
  await expect(card.getByRole("link", { name: "Conectar Bling" })).toHaveAttribute(
    "href",
    `/api/integracoes/bling/conectar?fornecedor=${supplierId}`,
  );
  await expect(page.getByRole("heading", { name: "Ou envie uma planilha" })).toBeVisible();
  const steps = page.getByRole("list", { name: "Como importar pela planilha" });
  await expect(steps.getByRole("heading")).toHaveText([
    "Baixe o modelo",
    "Preencha no Excel",
    "Envie a planilha",
  ]);
  await expect(steps.getByRole("button", { name: "Baixar modelo" })).toBeVisible();
});

test("o fornecedor importa do Bling dando o preço dos novos com uma regra e ajustando um", async ({
  page,
}) => {
  const supplierId = await supplierWithBrand(page, `Ateliê Com Bling ${run}`);
  await database.insert(supplierProducts).values({
    supplierId,
    sku: EXISTING_SKU,
    title: "Travesseiro Eco-Pluma",
    costCents: 2500,
    suggestedPriceCents: 3990,
  });
  await seedConnection(supplierId);

  await gotoHydrated(page, "/fornecedor/painel/importar");
  const card = page.getByRole("region", { name: "Bling" });
  await expect(card.getByText("Conectado", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Importar do Bling" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Enviar ao Bling o que falta lá" })).toBeVisible();
  await card.getByRole("button", { name: "Desconectar" }).click();
  const dialog = page.getByRole("dialog", { name: "Desconectar o Bling?" });
  await expect(dialog).toContainText("Os produtos que você já importou continuam no SellBridge");
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  await seedFinishedRead(supplierId);
  await gotoHydrated(page, "/fornecedor/painel/importar");
  const preview = page.getByRole("region", { name: "Prévia do Bling" });
  await expect(
    preview.getByRole("heading", { name: "3 produtos encontrados no Bling" }),
  ).toBeVisible();
  await expect(preview).toContainText("1 já está no SellBridge");
  await expect(preview).toContainText("2 são novos e precisam do preço para o revendedor");
  const importButton = preview.getByRole("button", { name: "Importar 3 produtos" });
  await expect(importButton).toBeDisabled();
  await expect(preview.getByText("Faltam 2 preços para importar.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ou envie uma planilha" })).toBeHidden();

  await preview.getByLabel("O revendedor paga").fill("95");
  await preview.getByRole("button", { name: "Aplicar a todos" }).click();
  await expect(preview.getByText("O desconto pode ser de 0 a 90% (recebido: 95%).")).toBeVisible();
  await preview.getByLabel("O revendedor paga").fill("30");
  await preview.getByRole("button", { name: "Aplicar a todos" }).click();
  const prices = preview.getByLabel("Preço para o revendedor");
  await expect(prices.nth(0)).toHaveValue("27,93");
  await expect(prices.nth(1)).toHaveValue("48,93");
  await prices.nth(1).fill("5000");
  await expect(prices.nth(1)).toHaveValue("50,00");
  await expect(importButton).toBeEnabled();

  const download = page.waitForEvent("download");
  await preview.getByRole("button", { name: "Baixar os novos em planilha" }).click();
  const file = await readFile(await (await download).path(), "utf8");
  expect(file).toContain(NEW_SKU_1);
  expect(file).toContain(NEW_SKU_2);
  expect(file).not.toContain(EXISTING_SKU);

  await importButton.click();
  await expect(page.getByRole("heading", { name: "Importação do Bling concluída" })).toBeVisible();
  const imported = await database
    .select({
      sku: supplierProducts.sku,
      costCents: supplierProducts.costCents,
      suggestedPriceCents: supplierProducts.suggestedPriceCents,
    })
    .from(supplierProducts)
    .where(eq(supplierProducts.supplierId, supplierId));
  expect(new Map(imported.map((row) => [row.sku, row]))).toEqual(
    new Map([
      [EXISTING_SKU, { sku: EXISTING_SKU, costCents: 2500, suggestedPriceCents: 3990 }],
      [NEW_SKU_1, { sku: NEW_SKU_1, costCents: 2793, suggestedPriceCents: 3990 }],
      [NEW_SKU_2, { sku: NEW_SKU_2, costCents: 5000, suggestedPriceCents: 6990 }],
    ]),
  );
  const [connection] = await database
    .select({ discount: supplierErpConnections.resellerDiscountTenths })
    .from(supplierErpConnections)
    .where(
      and(
        eq(supplierErpConnections.supplierId, supplierId),
        eq(supplierErpConnections.provider, "bling"),
      ),
    );
  expect(connection?.discount).toBe(300);
});
