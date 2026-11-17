import { expect, test } from "@playwright/test";
import { storeConnections, supplierProducts } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { ownSellableListing } from "./catalog-fixtures";
import { e2eDatabase } from "./database";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

/*
 * A listing on a Mercado Livre store: the edit price dialog prices it with the commission and the
 * shipping the store's own account answers (the stand-in in mercado-livre.fixture.ts: 14% and
 * R$ 15,00 of shipping), not with the published table. Cost R$ 20,00 and a 0,5 kg estimate would
 * break even at R$ 31,34; with the store's R$ 15,00 of shipping it takes R$ 40,70.
 */
const database = e2eDatabase();
let listing: Awaited<ReturnType<typeof ownSellableListing>> | undefined;

test.beforeAll(async () => {
  listing = await ownSellableListing(database, DEMO_USER.email);
  // Mercado Livre account ids are numbers; the shipping quote is asked by it.
  await database
    .update(storeConnections)
    .set({ externalShopId: String(Date.now()) })
    .where(eq(storeConnections.id, listing.storeId));
  await database
    .update(supplierProducts)
    .set({
      mercadoLivreCategoryId: "MLB1234",
      mercadoLivreAttributes: {
        SELLER_PACKAGE_HEIGHT: "10 cm",
        SELLER_PACKAGE_WIDTH: "15 cm",
        SELLER_PACKAGE_LENGTH: "20 cm",
        SELLER_PACKAGE_WEIGHT: "450 g",
      },
    })
    .where(eq(supplierProducts.id, listing.productId));
});

test.afterAll(async () => {
  await listing?.remove();
  await database.$client.end();
});

test("o preço da publicação usa a comissão e o frete da própria loja no Mercado Livre", async ({
  page,
}) => {
  if (listing === undefined) throw new Error("anúncio de teste não criado");
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/publicacoes?query=${encodeURIComponent(listing.title)}`);

  await page
    .getByRole("button", { name: `Ações de ${listing.title}` })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Editar preço" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar preço" });
  await expect(
    dialog.getByText(/^Comissão e frete da sua loja no Mercado Livre, consultados/),
  ).toBeVisible();

  const price = dialog.getByLabel("Preço de venda (R$)");
  await price.fill("35,00");
  await expect(
    dialog.getByText(/^Abaixo de R\$\s40,70 você tem prejuízo depois das taxas$/),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Salvar preço" })).toBeDisabled();

  await price.fill("40,70");
  await dialog.getByRole("button", { name: "Salvar preço" }).click();
  await expect(page.getByText(/^Preço atualizado/).filter({ visible: true })).toBeVisible();
});
