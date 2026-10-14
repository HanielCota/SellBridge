import { expect, test } from "@playwright/test";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

test.describe("avaliação de fornecedores", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, DEMO_USER);
  });

  test("avalia um pedido entregue e edita a avaliação", async ({ page }) => {
    await gotoHydrated(page, "/pedidos");
    await page.getByRole("button", { name: "Avaliações", exact: true }).click();
    await expect(page.getByRole("button", { name: "Para avaliar" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The seed leaves the newest deliveries unreviewed, so there is always one to rate.
    const firstRow = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: "Avaliar" }) })
      .first();
    // The order code is the first thing on the row's last line, whatever store numbering it has.
    const orderId = (await firstRow.getByRole("paragraph").last().textContent())
      ?.split("·")[0]
      ?.trim();
    expect(orderId).toBeDefined();
    await firstRow.getByRole("button", { name: "Avaliar" }).click();

    const dialog = page.getByRole("dialog", { name: "Como foi o fornecedor neste pedido?" });
    await dialog.getByRole("button", { name: "Enviar avaliação" }).click();
    await expect(dialog.getByText("Escolha de 1 a 5 estrelas.")).toBeVisible();

    await dialog.getByLabel("2 estrelas: Ruim").check();
    await expect(dialog.getByText("O que precisa melhorar?")).toBeVisible();
    await dialog.getByRole("button", { name: "Atrasou o despacho" }).click();
    // Moving to a good rating swaps complaints for praise and drops the complaint picked.
    await dialog.getByLabel("5 estrelas: Excelente").check();
    await expect(dialog.getByText("O que se destacou?")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Atrasou o despacho" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Despachou no prazo" }).click();
    await expect(dialog.getByRole("button", { name: "Despachou no prazo" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await dialog.getByLabel("Comentário (opcional)").fill("Chegou antes do prazo (teste E2E).");
    await dialog.getByRole("button", { name: "Enviar avaliação" }).click();
    await expect(page.getByText("Avaliação enviada").filter({ visible: true })).toBeVisible();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Avaliados", exact: true }).click();
    await page.getByLabel("Buscar pedido").fill(orderId ?? "");
    const reviewed = page.getByRole("listitem").filter({ hasText: orderId ?? "" });
    await expect(reviewed.getByText("Sua nota: 5 de 5")).toBeVisible();

    await reviewed.getByRole("button", { name: /Editar avaliação/ }).click();
    await expect(dialog.getByLabel("5 estrelas: Excelente")).toBeChecked();
    await expect(dialog.getByLabel("Comentário (opcional)")).toHaveValue(
      "Chegou antes do prazo (teste E2E).",
    );
    await dialog.getByLabel("4 estrelas: Bom").check();
    await dialog.getByRole("button", { name: "Enviar avaliação" }).click();
    await expect(reviewed.getByText("Sua nota: 4 de 5")).toBeVisible();
  });

  test("mostra o score no card e na página do fornecedor", async ({ page }) => {
    await gotoHydrated(page, "/fornecedores?sort=reputation");
    await expect(page.getByText(/^Reputação: /).first()).toBeAttached();
    await page.getByRole("link", { name: "Franca Calçados Direto da Fábrica" }).click();
    const panel = page.getByRole("region", { name: "Reputação do fornecedor" });
    await expect(panel.getByText(/Score do fornecedor · últimos 90 dias/)).toBeVisible();
    await expect(panel.getByText("Taxa de cancelamento")).toBeVisible();
  });
});
