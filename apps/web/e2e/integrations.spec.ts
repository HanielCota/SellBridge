import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn, waitForHydration } from "./helpers";

/** The organization of the demo account is named after its owner (see the seed). */
const DEMO_ORGANIZATION_NAME = "Ana Revendedora";

test("cria uma chave de leitura, chama a API com ela e revoga", async ({ page, request }) => {
  await signIn(page, DEMO_USER);
  await waitForHydration(page);
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Integrações" }).click();
  await expect(page).toHaveURL(/\/integracoes$/);
  await expect(page).toHaveTitle("Integrações | SellBridge");
  await expect(page.getByRole("link", { name: /Documentação da API/ })).toHaveAttribute(
    "href",
    "/api/v1/docs",
  );

  const keyName = `E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Nova chave" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nova chave de API" });
  await dialog.getByLabel("Nome da chave").fill(keyName);
  // Read scopes come preselected; writing stays off unless chosen.
  await expect(dialog.getByRole("checkbox", { name: "Ler pedidos" })).toBeChecked();
  await expect(
    dialog.getByRole("checkbox", { name: "Criar anúncios, mudar preço, pausar e reativar" }),
  ).not.toBeChecked();
  await dialog.getByRole("button", { name: "Criar chave" }).click();

  const created = page.getByRole("dialog", { name: "Chave criada" });
  await expect(created.getByText("ela não será mostrada de novo")).toBeVisible();
  const secret = await created.getByLabel("Chave secreta").inputValue();
  expect(secret).toMatch(/^sb_live_/);
  await expect(created.getByText(`Authorization: Bearer ${secret}`)).toBeVisible();
  await created.getByRole("button", { name: "Já guardei a chave" }).click();

  const row = page.getByRole("listitem", { name: keyName });
  await expect(row.getByText("Ativa", { exact: true })).toBeVisible();
  await expect(row.getByText("nunca usada")).toBeVisible();
  await expect(row.getByText(`${secret.slice(0, 14)}…`)).toBeVisible();

  const headers = { authorization: `Bearer ${secret}` };
  const me = await request.get("/api/v1/me", { headers });
  expect(me.status()).toBe(200);
  const body: unknown = await me.json();
  expect(body).toMatchObject({
    data: { organization: { name: DEMO_ORGANIZATION_NAME }, apiKey: { name: keyName } },
  });

  await row.getByRole("button", { name: `Revogar a chave ${keyName}` }).click();
  await page
    .getByRole("dialog", { name: /Revogar a chave/ })
    .getByRole("button", { name: "Revogar chave" })
    .click();
  await expect(page.getByText("Chave revogada").filter({ visible: true })).toBeVisible();
  await expect(row.getByText("Revogada", { exact: true })).toBeVisible();

  const revoked = await request.get("/api/v1/me", { headers });
  expect(revoked.status()).toBe(401);
});

test("sem chave a API responde 401 em problem+json", async ({ request }) => {
  const response = await request.get("/api/v1/me");
  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain("application/problem+json");
  const body: unknown = await response.json();
  expect(body).toMatchObject({ status: 401, code: "unauthorized" });
});

test("cadastra um webhook, mostra o segredo, desativa e exclui", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/integracoes");
  // Unique per run, so a failed earlier run never makes the row ambiguous.
  const url = `https://example.com/hook/${Date.now()}`;

  await page.getByRole("button", { name: "Novo webhook" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo webhook" });
  await dialog.getByLabel("URL de destino").fill(url);
  await expect(
    dialog.getByText("Sem nenhum marcado, o webhook recebe todos os eventos"),
  ).toBeVisible();
  await dialog.getByRole("checkbox", { name: "Pedido recebido" }).check();
  await dialog.getByRole("button", { name: "Criar webhook" }).click();

  const created = page.getByRole("dialog", { name: "Webhook criado" });
  await expect(created.getByText("ele não será mostrado de novo")).toBeVisible();
  expect(await created.getByLabel("Segredo de assinatura").inputValue()).toMatch(/^whsec_/);
  await expect(created.getByText("SellBridge-Signature").first()).toBeVisible();
  await created.getByRole("button", { name: "Já guardei o segredo" }).click();

  const row = page.getByRole("listitem", { name: url });
  await expect(row.getByText("order.created", { exact: true })).toBeVisible();
  await expect(row.getByText("Ativo", { exact: true })).toBeVisible();
  await expect(row.getByText("Nenhuma entrega ainda")).toBeVisible();

  const toggle = row.getByRole("switch", { name: "Receber eventos" });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(page.getByText("Webhook desativado").filter({ visible: true })).toBeVisible();
  await expect(row.getByText("Desativado", { exact: true })).toBeVisible();
  await expect(toggle).not.toBeChecked();

  await row.getByRole("button", { name: `Excluir o webhook ${url}` }).click();
  await page
    .getByRole("dialog", { name: "Excluir este webhook?" })
    .getByRole("button", { name: "Excluir webhook" })
    .click();
  await expect(page.getByText("Webhook excluído").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("listitem", { name: url })).toHaveCount(0);
});
