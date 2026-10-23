import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database";
import { suppliers } from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { ADMIN_USER, DEMO_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";
import { requireEnvironmentVariable } from "./environment";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
const supplierName = `Fornecedor CSV E2E ${Date.now()}`;
test.afterAll(async () => {
  await database.delete(suppliers).where(eq(suppliers.name, supplierName));
  await database.$client.end();
});

test("admin cadastra fornecedor, edita produtos e confirma CSV no desktop e celular", async ({
  page,
  browser,
}) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, "/admin/fornecedores");
  await page.getByRole("button", { name: "Novo fornecedor", exact: true }).click();
  await page.getByLabel("Nome", { exact: true }).fill(supplierName);
  await page.getByLabel("Nicho", { exact: true }).fill("Teste CSV");
  await page.getByLabel("Cidade de origem").fill("São Paulo");
  await page.getByRole("button", { name: "Salvar fornecedor" }).click();
  await expect(page.getByRole("heading", { name: supplierName, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/fornecedores\/[a-f0-9-]+/);

  await page.getByRole("button", { name: "Novo produto", exact: true }).click();
  await page.getByLabel("Código", { exact: true }).fill("CSV-MANUAL");
  await page.getByLabel("Título", { exact: true }).fill("Produto manual");
  await page.getByLabel("Custo (R$)", { exact: true }).fill("12,90");
  await page.getByLabel("Preço sugerido (R$)").fill("19,90");
  await page.getByLabel("Estoque", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await expect(page.getByRole("row", { name: /CSV-MANUAL/ })).toContainText("Produto manual");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar modelo CSV" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("modelo-produtos.csv");
  await page.getByLabel("Arquivo CSV (UTF-8) ou planilhas .xlsx").setInputFiles({
    name: "invalido.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("sku;titulo;custo;estoque\nCSV-NEW;Novo;12,90;1\nCSV-NEW;Duplicado;1;1"),
  });
  await page.getByRole("button", { name: "Gerar prévia" }).click();
  await expect(page.getByRole("button", { name: "Confirmar importação" })).toBeDisabled();
  await expect(page.getByRole("row", { name: /SKU duplicado/ })).toContainText("3");

  const csv =
    "sku;titulo;custo;estoque\nCSV-MANUAL;Produto atualizado;14.50;20\nCSV-NEW;Produto importado;12,90;5";
  await page
    .getByLabel("Arquivo CSV (UTF-8) ou planilhas .xlsx")
    .setInputFiles({ name: "produtos.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" && (request.postData()?.includes("CSV-MANUAL") ?? false),
  );
  await page.getByRole("button", { name: "Gerar prévia" }).click();
  const previewRequest = await requestPromise;
  await expect(
    page.getByText("1 produtos serão criados e 1 atualizados. 0 linhas com erro."),
  ).toBeVisible();

  const resellerContext = await browser.newContext();
  const resellerPage = await resellerContext.newPage();
  await signIn(resellerPage, DEMO_USER);
  const response = await resellerContext.request.post(previewRequest.url(), {
    data: previewRequest.postData() ?? "",
    headers: {
      "content-type": previewRequest.headers()["content-type"] ?? "application/json",
      "x-tsr-serverfn": "true",
    },
  });
  expect(response.status()).toBe(403);
  await resellerPage.goto("/admin/fornecedores");
  await expect(resellerPage).toHaveURL(/\/dashboard/);
  await resellerContext.close();

  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await expect(page.getByText("Importação concluída: 1 criados e 1 atualizados.")).toBeVisible();
  const manualRow = page.getByRole("row", { name: /CSV-MANUAL/ });
  await expect(manualRow).toContainText("Produto atualizado");
  await manualRow.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill("Produto editado");
  await page.getByRole("button", { name: "Salvar produto" }).click();
  await expect(manualRow).toContainText("Produto editado");
  await page.getByRole("searchbox", { name: "Buscar produtos" }).fill("CSV-MANUAL");
  await expect(page).toHaveURL(/query=CSV-MANUAL/);
  await expect(page.getByRole("row", { name: /CSV-NEW/ })).toHaveCount(0);
  await manualRow.getByRole("button", { name: "Desativar", exact: true }).click();
  await expect(manualRow).toContainText("Desativado");
  await page.getByRole("button", { name: "Desativar fornecedor", exact: true }).click();
  // Deactivating asks first, with how many resellers sell the supplier.
  await page
    .getByRole("dialog", { name: `Desativar ${supplierName}?` })
    .getByRole("button", { name: "Desativar fornecedor" })
    .click();
  await expect(page.getByRole("button", { name: "Ativar fornecedor", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const products = page.getByRole("list", { name: "Produtos do fornecedor" });
  await expect(products).toContainText("Produto editado");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("admin informa o e-mail para pedidos e os prazos do fornecedor", async ({ page }) => {
  const name = `${supplierName} prazos`;
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
  await gotoHydrated(page, "/admin/fornecedores");
  await page.getByRole("button", { name: "Novo fornecedor", exact: true }).click();
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByLabel("Nicho", { exact: true }).fill("Teste prazos");
  await page.getByLabel("Cidade de origem").fill("Recife");
  await expect(page.getByLabel("Prazo para aceitar (horas)")).toHaveValue("24");
  await expect(page.getByLabel("Prazo para despachar (horas)")).toHaveValue("48");

  await page.getByLabel("E-mail para pedidos (opcional)").fill("pedidos@");
  await page.getByRole("button", { name: "Salvar fornecedor" }).click();
  await expect(page.getByText("Informe um e-mail válido")).toBeVisible();

  await page.getByLabel("E-mail para pedidos (opcional)").fill("pedidos@fornecedor-e2e.com.br");
  await page.getByLabel("Prazo para aceitar (horas)").fill("12");
  await page.getByRole("button", { name: "Salvar fornecedor" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("E-mail para pedidos (opcional)")).toHaveValue(
    "pedidos@fornecedor-e2e.com.br",
  );
  await expect(page.getByLabel("Prazo para aceitar (horas)")).toHaveValue("12");
  await database.delete(suppliers).where(eq(suppliers.name, name));
});
