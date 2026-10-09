import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn, signUp } from "./helpers";

test.describe("dashboard", () => {
  test("mostra KPIs, gráfico e filtros por período e loja", async ({ page }) => {
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/dashboard");
    await expect(page.getByRole("heading", { name: "Painel de vendas" })).toBeVisible();
    await expect(page.getByText("Lucro no período")).toBeVisible();
    for (const label of ["Receita", "Pedidos", "Ticket médio"]) {
      await expect(page.getByRole("article").filter({ hasText: label }).first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Precisa de você" })).toBeVisible();
    await expect(
      page.getByRole("figure", { name: "Gráfico de receita e lucro por dia" }),
    ).toBeVisible();
    await page.locator("label", { hasText: /^Lucro$/ }).click();
    await expect(page.getByRole("radio", { name: "Lucro" })).toBeChecked();
    await expect(page.getByRole("link", { name: "Exportar CSV do período" })).toBeVisible();
    await expect(page.getByText("Vendas por loja")).toBeVisible();
    await expect(page.getByText("Produtos mais vendidos")).toBeVisible();

    await page.locator("label", { hasText: "6 meses" }).click();
    await expect(page.getByRole("radio", { name: "6 meses" })).toBeChecked();
    await expect(page).toHaveURL(/period=180d/);
    await expect(page.getByRole("figure", { name: /por semana/ })).toBeVisible();

    await page.getByLabel("Loja", { exact: true }).click();
    await page.getByRole("option", { name: "Ana Moda (loja simulada)" }).click();
    await expect(page).toHaveURL(/store=/);
    await expect(page.getByText("Ana Casa & Beleza (loja simulada)")).toHaveCount(0);
  });

  test("mostra checklist de primeiros passos para conta nova", async ({ page }) => {
    await signUp(page, "Revendedor Novo Dashboard");
    await gotoHydrated(page, "/dashboard");
    await expect(page.getByText("Primeiros passos")).toBeVisible();
    await expect(page.getByRole("link", { name: "Informar CEP" })).toBeVisible();
  });
});

test.describe("financeiro", () => {
  test("ordena, filtra, pagina e exporta CSV com os mesmos filtros", async ({ page }) => {
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/financeiro?period=180d");
    await expect(page.getByText("Lucro líquido")).toBeVisible();
    await expect(page.getByText(/pedidos · página 1 de/)).toBeVisible();

    await page.getByRole("button", { name: "Ordenar por lucro" }).click();
    await expect(page).toHaveURL(/sort=profit/);
    await expect(page).toHaveURL(/direction=desc/);

    await page.getByRole("button", { name: "Próxima" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(/página 2 de/)).toBeVisible();

    await page.getByLabel("Filtrar por status do pedido").click();
    await page.getByRole("option", { name: "Devolvido" }).click();
    await expect(page).toHaveURL(/status=returned/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page.getByRole("cell", { name: "Entregue" })).toHaveCount(0);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Exportar CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^financeiro-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.csv$/,
    );
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const csv = Buffer.concat(chunks).toString("utf8");
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("Data;Pedido;Loja;Comprador;Status");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.slice(1).every((line) => line.includes(";Devolvido;"))).toBe(true);
  });

  test("mostra estado vazio para conta sem pedidos", async ({ page }) => {
    await signUp(page, "Revendedor Sem Pedidos");
    await gotoHydrated(page, "/financeiro");
    await expect(page.getByText("Ainda não há movimentações")).toBeVisible();
  });

  test("bloqueia a exportação sem sessão", async ({ request }) => {
    const response = await request.get("/api/financeiro/exportar");
    expect(response.status()).toBe(401);
  });
});
