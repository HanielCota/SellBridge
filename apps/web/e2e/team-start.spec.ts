import { expect, test } from "@playwright/test";
import { ADMIN_USER, signIn } from "./helpers";

/** An attendant of the seeded support team; the team shares the admin's seed password. */
const AGENT_USER = { email: "bruno.suporte@sellbridge.local", password: ADMIN_USER.password };

/*
 * Regression: a new attendant landed on the reseller's "Falta pouco para sua primeira venda" and
 * the ticket queue sent them back there until they found the "Modo equipe" switch.
 */
test("a atendente entra direto na fila de chamados", async ({ page }) => {
  await signIn(page, AGENT_USER);
  await expect(page).toHaveURL(/\/admin\/chamados/);
  await expect(page.getByRole("heading", { name: "Chamados" })).toBeVisible();
  await expect(page.getByText("Falta pouco para sua primeira venda")).toHaveCount(0);
});

test("o admin continua entrando no painel de vendas", async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await expect(page).toHaveURL(/\/dashboard/);
});
