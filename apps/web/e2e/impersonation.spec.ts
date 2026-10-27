import { expect, test } from "@playwright/test";
import { user } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import {
  ADMIN_USER,
  enableAdminMode,
  gotoHydrated,
  signIn,
  signUp,
  uniqueEmail,
  waitForHydration,
} from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

/** A fresh reseller whose e-mail is already confirmed, as most real accounts are. */
async function verifiedCustomer(browser: import("@playwright/test").Browser, name: string) {
  const page = await browser.newPage();
  const email = await signUp(page, name);
  await page.close();
  const [row] = await database
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, email))
    .returning({ id: user.id });
  if (!row) throw new Error("cliente de teste não criado");
  return { id: row.id, email };
}

test("o admin dentro da conta do cliente: o que fica travado e o que fica registrado", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const customer = await verifiedCustomer(browser, "Cliente Acesso Assistido");
  const page = await browser.newPage();
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, `/admin/clientes/${customer.id}`);

  await page.getByRole("button", { name: "Entrar como cliente" }).click();
  const banner = page.getByRole("complementary", { name: "Acesso como cliente" });
  await expect(banner).toContainText("até");
  await expect(banner).toContainText("ficam bloqueados");
  await waitForHydration(page);

  await gotoHydrated(page, "/integracoes");
  await expect(page.getByRole("button", { name: "Nova chave" }).first()).toBeDisabled();

  await gotoHydrated(page, "/lojas");
  await expect(page.getByText("Conectar e desconectar lojas ficam travados")).toBeVisible();

  await banner.getByRole("button", { name: "Voltar ao admin" }).click();
  await expect(page).toHaveURL(/\/admin\/clientes/);
  await gotoHydrated(page, `/admin/clientes/${customer.id}`);
  await expect(page.getByText("Saiu da conta do cliente")).toBeVisible();

  // A new address loses the confirmed mark until its owner opens the link.
  await page.getByLabel("E-mail", { exact: true }).fill(uniqueEmail("trocado"));
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(page.getByText("E-mail não confirmado")).toBeVisible();
  await expect(page.getByText("Trocou o e-mail")).toBeVisible();
  const [row] = await database
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, customer.id));
  expect(row?.emailVerified).toBe(false);
});
