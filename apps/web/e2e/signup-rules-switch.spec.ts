import { expect, test } from "@playwright/test";
import { getSignupRulesSince } from "@sellbridge/database/repositories";
import { e2eDatabase } from "./database";
import { ADMIN_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";

const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

test("a chave das regras de cadastro explica o que muda e só vale ao salvar", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, "/admin/configuracoes");
  const card = page.getByRole("region", { name: "Regras de cadastro dos contratos" });
  await expect(card.getByText("Desligado", { exact: true })).toBeVisible();

  await card.getByLabel("Aplicar as regras de cadastro dos contratos").click();

  await expect(card.getByText("Ao salvar:")).toBeVisible();
  await expect(card.getByText(/MEI é recusado na hora, com o motivo/).last()).toBeVisible();
  await expect(card.getByRole("button", { name: "Salvar" })).toBeEnabled();
  await expect(card.getByText("Desligado", { exact: true })).toBeVisible();
  expect(await getSignupRulesSince(database)).toBeNull();

  await card.getByLabel("Aplicar as regras de cadastro dos contratos").click();

  await expect(card.getByText("Ao salvar:")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Salvar" })).toBeDisabled();
});
