import { expect, test } from "@playwright/test";
import { categories, supplierProducts, suppliers } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { e2eDatabase } from "./database";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const stamp = Date.now();

test.afterAll(async () => {
  await accounts.removeAll();
});

async function categoryId(): Promise<string | null> {
  const [category] = await database
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, "casa"));
  return category?.id ?? null;
}

/** A draft complete in everything but its NF-e data; `fiscalRequired` marks it new or old. */
async function draftWithoutNcm(supplierId: string, sku: string, fiscalRequired: boolean) {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku,
      title: `Luminária de mesa ${sku}`,
      description: "Luminária de mesa com cúpula de tecido e base de madeira, para teste.",
      costCents: 4500,
      suggestedPriceCents: 8990,
      stock: 12,
      categoryId: await categoryId(),
      imageUrls: ["https://imagens.sellbridge.test/luminaria.jpg"],
      reviewStatus: fiscalRequired ? "draft" : "approved",
      fiscalRequired,
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) {
    throw new Error("produto de teste não criado");
  }
  return product.id;
}

// Fiscal rule of 10/11/2026: a new product only goes on sale with NCM, origin and unit.
test("um produto novo só é publicado depois de NCM, origem e unidade", async ({ page }) => {
  const email = await accounts.signUp(page, `Fornecedor fiscal ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Marca fiscal ${stamp}`);
  const productId = await draftWithoutNcm(supplierId, `FIS-${stamp}`, true);

  await gotoHydrated(page, `/fornecedor/painel/produtos?product=${productId}&field=fiscal.ncm`);
  const fiscal = page.getByRole("group", { name: "Dados fiscais (vão na nota fiscal)" });
  await expect(fiscal).toBeVisible();
  await expect(page.getByText("Informe NCM, origem e unidade para publicar")).toBeVisible();

  await fiscal.getByLabel("NCM (código fiscal do produto, 8 números)").fill("00000000");
  await expect(fiscal.getByText("O NCM não pode ser 0000.00.00", { exact: false })).toBeVisible();
  await fiscal.getByLabel("NCM (código fiscal do produto, 8 números)").fill("94055000");
  await expect(fiscal.getByLabel("NCM (código fiscal do produto, 8 números)")).toHaveValue(
    "9405.50.00",
  );
  await fiscal.getByLabel("Origem").click();
  await page.getByRole("option", { name: "0 – Nacional (fabricado no Brasil)" }).click();
  await fiscal.getByLabel("Unidade").click();
  await page.getByRole("option", { name: "UN – unidade" }).click();
  await expect(page.getByText("Salvo", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: /Revisão/ }).click();
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByText("Produto publicado: já aparece para os revendedores")).toBeVisible();
  const [stored] = await database
    .select({ fiscal: supplierProducts.fiscal, status: supplierProducts.reviewStatus })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productId));
  expect(stored).toMatchObject({
    status: "approved",
    fiscal: { ncm: "94055000", origin: 0, unit: "UN" },
  });
});

test("um produto de antes continua à venda e a lista avisa que falta NCM", async ({ page }) => {
  const email = await accounts.signUp(page, `Fornecedor antigo ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Marca antiga ${stamp}`);
  await draftWithoutNcm(supplierId, `OLD-${stamp}`, false);

  await gotoHydrated(page, "/fornecedor/painel/produtos");
  const notice = page.getByRole("region", { name: "Produtos sem dados fiscais" });
  await expect(notice.getByText("1 produto sem dados fiscais")).toBeVisible();
  await expect(page.getByText("Falta NCM").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Aprovado").filter({ visible: true }).first()).toBeVisible();

  await notice.getByRole("button", { name: "Completar" }).click();
  await expect(page).toHaveURL(/fiscal=missing/);
  await expect(notice.getByRole("button", { name: "Ver todos os produtos" })).toBeVisible();
});

test("a marca guarda os dados fiscais da empresa com o endereço pelo CEP", async ({ page }) => {
  const email = await accounts.signUp(page, `Fornecedor empresa ${stamp}`);
  const supplierId = await giveTestBrand(database, email, `Marca empresa ${stamp}`);
  await page.route("https://viacep.com.br/ws/35500024/json/", async (route) => {
    await route.fulfill({
      json: {
        cep: "35500-024",
        logradouro: "Rua Goiás",
        bairro: "Centro",
        localidade: "Divinópolis",
        uf: "MG",
        ibge: "3122306",
      },
    });
  });

  await gotoHydrated(page, "/fornecedor/painel/marca");
  const card = page.locator("section", {
    has: page.getByRole("heading", { name: "Dados fiscais da empresa" }),
  });
  await card.getByLabel("CNPJ").fill("11222333000181");
  await card.getByLabel("Razão social").fill("Marca Empresa Teste Ltda");
  await card.getByLabel("Inscrição estadual").fill("ISENTO");
  await card.getByLabel("CEP").fill("35500024");
  await expect(card.getByText("Endereço encontrado pelo CEP", { exact: false })).toBeVisible();
  await expect(card.getByLabel("Cidade")).toHaveValue("Divinópolis");
  await card.getByLabel("Número").fill("120");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();

  await expect
    .poll(async () => {
      const [stored] = await database
        .select({ profile: suppliers.fiscalProfile })
        .from(suppliers)
        .where(eq(suppliers.id, supplierId));
      return stored?.profile ?? null;
    })
    .toMatchObject({
      cnpj: "11222333000181",
      stateRegistration: "ISENTO",
      regime: "simples",
      address: { city: "Divinópolis", state: "MG", ibgeCode: "3122306", number: "120" },
      defaults: { cfopInState: "5102", icmsCode: "102" },
    });
});

test("o endereço de cobrança do revendedor vem pelo CEP", async ({ page }) => {
  await page.route("https://viacep.com.br/ws/01310100/json/", async (route) => {
    await route.fulfill({
      json: {
        cep: "01310-100",
        logradouro: "Avenida Paulista",
        bairro: "Bela Vista",
        localidade: "São Paulo",
        uf: "SP",
        ibge: "3550308",
      },
    });
  });
  await signIn(page, DEMO_USER);

  await gotoHydrated(page, "/onboarding?step=details");
  const changeAddress = page.getByRole("button", { name: "Alterar endereço" });
  if (await changeAddress.isVisible()) {
    await changeAddress.click();
  }
  await page.getByLabel("CEP").fill("01310100");

  await expect(page.getByText("Endereço encontrado pelo CEP", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Rua")).toHaveValue("Avenida Paulista");
  await expect(page.getByLabel("Bairro")).toHaveValue("Bela Vista");
  await expect(page.getByLabel("Cidade")).toHaveValue("São Paulo");
});
