import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { member, suppliers, user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { gotoHydrated, signUpAsSupplier } from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));

test.afterAll(async () => {
  await database.$client.end();
});

async function brandOf(email: string) {
  const [row] = await database
    .select({
      name: suppliers.name,
      city: suppliers.city,
      state: suppliers.state,
      contactEmail: suppliers.contactEmail,
      acceptWithinHours: suppliers.acceptWithinHours,
    })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .innerJoin(suppliers, eq(suppliers.organizationId, member.organizationId))
    .where(eq(user.email, email));
  return row;
}

test("fornecedor novo cadastra a marca e segue para os produtos", async ({ page }) => {
  // Regression: a panel page drew for an instant without its brand and threw in the browser.
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  const email = await signUpAsSupplier(page, "Olaria Nova");
  await expect(page).toHaveURL(/\/fornecedor\/painel\/marca\?perfil=[a-z0-9-]+$/);

  await page.getByLabel("Nome da marca").fill("Olaria Nova");
  await page.getByLabel("O que você vende (nicho)").fill("Casa e decoração");
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

test("fornecedor edita os dados da marca", async ({ page }) => {
  const email = await signUpAsSupplier(page, "Olaria Editada");
  await page.getByLabel("Nome da marca").fill("Olaria Editada");
  await page.getByLabel("O que você vende (nicho)").fill("Cozinha");
  await page.getByLabel("Cidade de onde você envia").fill("Cunha");
  await page.getByRole("button", { name: "Cadastrar marca" }).click();
  await expect(page).toHaveURL(/\/fornecedor\/painel\/produtos/);

  await gotoHydrated(page, "/fornecedor/painel/marca");
  await expect(page.getByRole("heading", { name: "Dados da marca" })).toBeVisible();
  await page.getByLabel("Cidade de onde você envia").fill("Taubaté");
  await page.getByLabel("Prazo para aceitar (horas)").fill("12");
  await page.getByRole("button", { name: "Salvar dados" }).click();

  await expect(page.getByText("Dados da marca salvos")).toBeVisible();
  expect(await brandOf(email)).toMatchObject({ city: "Taubaté", acceptWithinHours: 12 });
});
