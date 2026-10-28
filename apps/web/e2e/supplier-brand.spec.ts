import { expect, test } from "@playwright/test";
import { member, suppliers, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { gotoHydrated, pickBrandNiche } from "./helpers";
import { e2eDatabase } from "./database";
import { supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);

test.afterAll(async () => {
  await accounts.removeAll();
  await database.$client.end();
});

async function brandOf(email: string) {
  const [row] = await database
    .select({
      name: suppliers.name,
      city: suppliers.city,
      state: suppliers.state,
      contactEmail: suppliers.contactEmail,
      niche: suppliers.niche,
      acceptWithinHours: suppliers.acceptWithinHours,
      dispatchWithinHours: suppliers.dispatchWithinHours,
    })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(suppliers, eq(suppliers.organizationId, member.organizationId))
    .where(eq(user.email, email));
  return row;
}

test("keeps unsaved new brand fields when leaving is cancelled", async ({ page }) => {
  await accounts.signUp(page, "Brand registration draft");
  await page.getByLabel("Nome da marca").fill("Unsaved brand name");
  const confirmations: string[] = [];
  page.on("dialog", async (dialog) => {
    confirmations.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Suporte", exact: true }).click();
  await page.getByRole("link", { name: "Abrir chamado", exact: true }).click();
  await expect.poll(() => confirmations).toEqual([expect.stringMatching(/alterações não salvas/)]);
  await expect(page).toHaveURL(/\/fornecedor\/painel\/marca/);
  await expect(page.getByLabel("Nome da marca")).toHaveValue("Unsaved brand name");
});

test("fornecedor novo cadastra a marca e segue para os produtos", async ({ page }) => {
  // Regression: a panel page drew for an instant without its brand and threw in the browser.
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  const email = await accounts.signUp(page, "Olaria Nova");
  await expect(page).toHaveURL(/\/fornecedor\/painel\/marca\?perfil=[a-z0-9-]+$/);

  await page.getByLabel("Nome da marca").fill("Olaria Nova");
  await pickBrandNiche(page, "Casa e decoração");
  await page.getByLabel("Cidade de onde você envia").fill("Cunha");
  await page.getByRole("button", { name: "Cadastrar marca" }).click();

  await expect(page).toHaveURL(/\/fornecedor\/painel\/produtos/);
  await expect(page.getByRole("button", { name: "Cadastrar produto" }).first()).toBeVisible();
  expect(await brandOf(email)).toMatchObject({
    name: "Olaria Nova",
    city: "Cunha",
    state: "SP",
    contactEmail: email,
  });
  expect(browserErrors.filter((text) => text.includes("marca está cadastrada"))).toEqual([]);
});

test("fornecedor edita os dados da marca pela barra de salvar", async ({ page }) => {
  const email = await accounts.signUp(page, "Olaria Editada");
  await page.getByLabel("Nome da marca").fill("Olaria Editada");
  await pickBrandNiche(page, "Cozinha");
  await page.getByLabel("Cidade de onde você envia").fill("Cunha");
  await page.getByRole("button", { name: "Cadastrar marca" }).click();
  await expect(page).toHaveURL(/\/fornecedor\/painel\/produtos/);

  await gotoHydrated(page, "/fornecedor/painel/marca");
  await expect(
    page.getByRole("heading", { name: "Como os revendedores veem sua marca" }),
  ).toBeVisible();
  const saveBar = page.getByRole("region", { name: "Alterações não salvas" });
  await expect(saveBar).toHaveCount(0);

  await page.getByLabel("Cidade de onde você envia").fill("Taubaté");
  await expect(page.getByLabel("Prévia no catálogo")).toContainText("Taubaté - SP");
  const accept = page.getByRole("group", { name: "Para aceitar o pedido" });
  await accept.getByRole("button", { name: "3 dias" }).click();
  // Dispatch can't come before accept, so it moves up to 3 days with it.
  const dispatch = page.getByRole("group", { name: "Para despachar" });
  await expect(dispatch.getByRole("button", { name: "3 dias" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(dispatch.getByRole("button", { name: "2 dias" })).toHaveCount(0);
  await saveBar.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByText("Dados da marca salvos")).toBeVisible();
  await expect(saveBar).toHaveCount(0);
  expect(await brandOf(email)).toMatchObject({
    city: "Taubaté",
    niche: "Cozinha",
    acceptWithinHours: 72,
    dispatchWithinHours: 72,
  });
});

test("fornecedor descarta alterações e escreve uma categoria fora da lista", async ({ page }) => {
  const email = await accounts.signUp(page, "Ateliê Prata");
  await page.getByLabel("Nome da marca").fill("Ateliê Prata");
  await pickBrandNiche(page, "Outra");
  await page.getByLabel("Qual categoria?").fill("Semijoias");
  await page.getByLabel("Cidade de onde você envia").fill("Limeira");
  await page.getByRole("button", { name: "Cadastrar marca" }).click();
  await expect(page).toHaveURL(/\/fornecedor\/painel\/produtos/);
  expect(await brandOf(email)).toMatchObject({ niche: "Semijoias" });

  await gotoHydrated(page, "/fornecedor/painel/marca");
  await expect(page.getByLabel("Qual categoria?")).toHaveValue("Semijoias");
  await page.getByLabel("Nome da marca").fill("Outro nome");
  const saveBar = page.getByRole("region", { name: "Alterações não salvas" });
  await saveBar.getByRole("button", { name: "Descartar" }).click();

  await expect(page.getByLabel("Nome da marca")).toHaveValue("Ateliê Prata");
  await expect(saveBar).toHaveCount(0);
});
