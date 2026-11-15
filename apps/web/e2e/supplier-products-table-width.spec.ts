import { expect, test } from "@playwright/test";
import { supplierProducts } from "@sellbridge/database/schema";
import { e2eDatabase } from "./database";
import { gotoHydrated } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const stamp = Date.now();
const widestTitle = `Conjunto cropped de linho com short de cintura alta e bolsos ${stamp}`;

test.afterAll(async () => {
  await accounts.removeAll();
});

/*
 * Regression: on a 1280 px screen the Produtos table was wider than its card, so "Estoque" and
 * "Atualizado" hid under the pinned actions column and the supplier had to scroll sideways.
 */
test("a tabela de produtos cabe numa tela de 1280 px sem rolar para o lado", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const email = await accounts.signUp(page, `Fornecedor largura ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Marca largura ${stamp}`);
  await database.insert(supplierProducts).values([
    {
      supplierId,
      sku: `SAIA-PLISSADA-MIDI-ROSA-GG-${stamp}`,
      title: widestTitle,
      description: "Produto com os textos mais longos que a tabela mostra",
      costCents: 1_234_567,
      suggestedPriceCents: 2_469_900,
      stock: 12_345,
      imageUrls: [],
      active: false,
      reviewStatus: "rejected",
      rejectionReasons: [
        { field: "title", rule: "title_length", message: "Encurte o título para até 60 letras" },
      ],
    },
    {
      supplierId,
      sku: `CURTO-${stamp}`,
      title: `Saia midi ${stamp}`,
      description: "Produto comum ao lado do mais largo",
      costCents: 4990,
      suggestedPriceCents: 9990,
      stock: 3,
      imageUrls: [],
      reviewStatus: "approved",
    },
  ]);

  await gotoHydrated(page, "/fornecedor/painel/produtos");
  const table = page.getByRole("table", { name: "Produtos" });
  await expect(table.getByRole("row").filter({ hasText: widestTitle })).toBeVisible();

  const overflow = await table.evaluate((element) => {
    const container = element.parentElement;
    if (container === null) {
      throw new Error("the products table has no container");
    }
    return container.scrollWidth - container.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
});
