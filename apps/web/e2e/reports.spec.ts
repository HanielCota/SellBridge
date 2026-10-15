import { expect, test } from "@playwright/test";
import { simulateSale } from "./sales";
import { DEMO_USER, gotoHydrated, signIn, signUp } from "./helpers";

test.describe("dashboard", () => {
  test("mostra KPIs, gráfico e filtros por período e loja", async ({ page }) => {
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/dashboard");
    await expect(page.getByRole("heading", { name: "Painel de vendas" })).toBeVisible();
    await expect(page.getByText(/comparado com os \d+ dias anteriores/)).toBeVisible();
    // One sentence reads the period: the profit with its margin, then revenue and why.
    const reading = page.getByRole("region", { name: "Resumo do período" });
    await expect(reading.getByText(/Você lucrou R\$/)).toBeVisible();
    await expect(reading.getByText(/de margem/)).toBeVisible();
    await expect(reading.getByText(/A receita (subiu|caiu|ficou igual)/)).toBeVisible();
    // Tiles beside the chart open the financial report.
    for (const label of ["receita", "pedidos", "ticket médio"]) {
      await expect(page.getByRole("link", { name: `Ver ${label} no financeiro` })).toHaveAttribute(
        "href",
        "/financeiro",
      );
    }
    await expect(page.getByRole("heading", { name: "Precisa de você" })).toBeVisible();
    const chart = page.getByRole("figure", { name: "Gráfico: receita e lucro" });
    await expect(chart).toBeVisible();
    await page.locator("label", { hasText: /^Lucro$/ }).click();
    await expect(page.getByRole("radio", { name: "Lucro" })).toBeChecked();
    await expect(page.getByRole("link", { name: "Exportar CSV do período" })).toBeVisible();
    await expect(page.getByText("Vendas por loja").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Produtos mais vendidos").filter({ visible: true })).toBeVisible();

    await page.locator("label", { hasText: "6 meses" }).click();
    await expect(page.getByRole("radio", { name: "6 meses" })).toBeChecked();
    await expect(page).toHaveURL(/period=180d/);
    await expect(chart).toBeVisible();

    await page.getByLabel("Loja", { exact: true }).click();
    await page.getByRole("option", { name: "Ana Moda (loja simulada)" }).click();
    await expect(page).toHaveURL(/store=/);
    await expect(page.getByText("Ana Casa & Beleza (loja simulada)")).toHaveCount(0);
  });

  test("mostra checklist de primeiros passos para conta nova", async ({ page }) => {
    await signUp(page, "Revendedor Novo Dashboard");
    await gotoHydrated(page, "/dashboard");
    await expect(
      page.getByRole("heading", { name: "Falta pouco para sua primeira venda" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Completar cadastro" })).toBeVisible();
  });
});

test.describe("financeiro", () => {
  test("ordena, filtra, pagina e exporta CSV com os mesmos filtros", async ({ page }) => {
    await signIn(page, DEMO_USER);
    // The dashboard's chart, with its tools; daily periods pick a day from the keyboard.
    await gotoHydrated(page, "/financeiro?period=30d");
    await expect(page.getByText("Lucro no período")).toBeVisible();
    await expect(page.getByText(/^Você vendeu R\$/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Exportar CSV do período" })).toBeVisible();
    const chart = page.getByRole("figure", { name: /^Gráfico: receita e lucro/ });
    await chart.locator(".recharts-surface").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/day=\d{4}-\d{2}-\d{2}/);
    await page.getByRole("button", { name: "Ver o período todo" }).click();
    await expect(page).not.toHaveURL(/day=/);

    await gotoHydrated(page, "/financeiro?period=180d");
    await expect(page.getByText(/pedidos · página 1 de/).filter({ visible: true })).toBeVisible();

    await page.getByLabel("Ordenar pedidos").click();
    await page.getByRole("option", { name: "Maior lucro" }).click();
    await expect(page).toHaveURL(/sort=profit/);
    await expect(page).toHaveURL(/direction=desc/);

    await page.getByRole("button", { name: "Próxima" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(/página 2 de/).filter({ visible: true })).toBeVisible();

    await page
      .getByRole("group", { name: "Filtrar por etapa do pedido" })
      .getByRole("button", { name: "Cancelados e devolvidos" })
      .click();
    await expect(page).toHaveURL(/stage=issue/);
    await expect(page).not.toHaveURL(/page=2/);
    // Only cancelled and returned orders carry a status badge, so the list now shows one per row.
    await expect(
      page.getByLabel("Financeiro por pedido").getByRole("button").first(),
    ).toContainText(/Cancelado|Devolvido/);

    const exportLink = page.getByRole("link", { name: "Exportar CSV do período" });
    await expect(exportLink).toHaveAttribute("href", /stage=issue/);
    const downloadPromise = page.waitForEvent("download");
    await exportLink.click();
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
    expect(
      lines.slice(1).every((line) => line.includes(";Devolvido;") || line.includes(";Cancelado;")),
    ).toBe(true);
  });

  test("mostra estado vazio para conta sem pedidos", async ({ page }) => {
    await signUp(page, "Revendedor Sem Pedidos");
    await gotoHydrated(page, "/financeiro");
    await expect(
      page.getByText("Ainda não há movimentações").filter({ visible: true }),
    ).toBeVisible();
  });

  test("bloqueia a exportação sem sessão", async ({ request }) => {
    const response = await request.get("/api/financeiro/exportar");
    expect(response.status()).toBe(401);
  });
});

test.describe("avisos", () => {
  test("o sino lista vendas recentes e zera os não lidos ao abrir", async ({ page }) => {
    await signIn(page, DEMO_USER);
    // Its own sale first: "Limpar tudo" may have emptied the demo account's bell earlier.
    await simulateSale(page);
    await expect(async () => {
      await gotoHydrated(page, "/dashboard");
      await page.getByRole("button", { name: /^Avisos/ }).click();
      await expect(page.getByText("Avisos", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: /Nova venda de R\$/ }).first()).toBeVisible({
        timeout: 2000,
      });
    }).toPass({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Avisos" })).toBeVisible();
  });

  test("conta nova não tem avisos", async ({ page }) => {
    await signUp(page, "Revendedor Sem Avisos");
    await gotoHydrated(page, "/onboarding");
    await page.getByRole("button", { name: "Avisos" }).click();
    await expect(page.getByText(/Nada novo por aqui/)).toBeVisible();
  });
});

test.describe("busca global", () => {
  test("Ctrl+K encontra um pedido e leva até ele no financeiro", async ({ page }) => {
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/dashboard");
    const input = page.getByPlaceholder(/Buscar produtos, publicações, pedidos/);
    // The root marks hydration before the header's shortcut listener may be attached, so a
    // press that lands too early is retried instead of failing the run.
    // Ctrl+K toggles the palette, so it is pressed again only while the input is still hidden.
    await expect(async () => {
      if (!(await input.isVisible())) {
        await page.keyboard.press("Control+k");
      }
      await expect(input).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await input.fill("financeiro");
    await expect(page.getByRole("option", { name: /Financeiro/ })).toBeVisible();
    await input.fill("MOCK-ORD-0000");
    const order = page.getByRole("option", { name: /^MOCK-ORD-0000/ }).first();
    await expect(order).toBeVisible();
    await order.click();
    await expect(page).toHaveURL(/\/financeiro\?query=MOCK-ORD-0000/);
  });
});
