import { expect, test } from "@playwright/test";
import { ADMIN_USER, enableAdminMode, gotoHydrated, signIn } from "./helpers";

/*
 * The coordination reaches the support performance screen from the queue in one click, moves
 * between its sections with the state in the URL, and opens a team member's sheet from the
 * team table and from the Equipe page. The seeded support history (seed/support-performance.ts)
 * gives every view data.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page, ADMIN_USER);
  await enableAdminMode(page);
});

test("a coordenação abre o desempenho pela fila e navega pelas seções", async ({ page }) => {
  await gotoHydrated(page, "/admin/chamados");
  const area = page.getByRole("group", { name: "Área do suporte" });
  await area.getByRole("button", { name: "Desempenho" }).click();

  await expect(page).toHaveURL(/\/admin\/chamados\/metricas/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Desempenho do suporte" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Precisa de você" })).toBeVisible();

  const sections = page.getByRole("group", { name: "Seção" });
  await sections.getByRole("button", { name: "Equipe" }).click();
  await expect(page).toHaveURL(/secao=equipe/);
  await expect(page.getByRole("heading", { name: /Por pessoa/ })).toBeVisible();

  await sections.getByRole("button", { name: "Assuntos" }).click();
  await expect(page).toHaveURL(/secao=assuntos/);
  await page.getByRole("link", { name: "O pedido atrasou" }).first().click();
  await expect(page).toHaveURL(/\/admin\/chamados\?.*situacao=order-late/);
  await expect(page.getByText("Filtrando por")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tirar o filtro O pedido atrasou" })).toBeVisible();
  // The same situation id exists for suppliers: the queue keeps the kind of customer too.
  await expect(page.getByRole("button", { name: "Tirar o filtro Revendedores" })).toBeVisible();
});

test("o período e o tipo de cliente ficam na URL e sobrevivem ao recarregar", async ({ page }) => {
  await gotoHydrated(page, "/admin/chamados/metricas");
  await page
    .getByRole("group", { name: "Período" })
    .getByRole("button", { name: "7 dias" })
    .click();
  await page
    .getByRole("group", { name: "Quem abriu" })
    .getByRole("button", { name: "Revendedores" })
    .click();
  await expect(page).toHaveURL(/days=7/);
  await expect(page).toHaveURL(/origem=revendedor/);

  await page.reload();
  await expect(
    page.getByRole("group", { name: "Período" }).getByRole("button", { name: "7 dias" }),
  ).toHaveAttribute("aria-pressed", "true");
  // Seven whole days, Monday to Sunday or wherever today falls: one bar label per day.
  await expect(page.getByRole("figure", { name: /entraram e foram resolvidos/ })).toBeVisible();
});

test("um link para quem não está no período avisa e volta para a equipe", async ({ page }) => {
  await gotoHydrated(page, "/admin/chamados/metricas?pessoa=ninguem");
  await expect(page.getByText("Essa pessoa não aparece na equipe deste período.")).toBeVisible();
  await page.getByRole("button", { name: "Ver a equipe" }).click();
  await expect(page).not.toHaveURL(/pessoa=/);
});

test("a ficha de uma pessoa abre pela tabela e pela página Equipe", async ({ page }) => {
  await gotoHydrated(page, "/admin/chamados/metricas?secao=equipe");
  await page.getByRole("link", { name: /Camila Duarte/ }).click();

  await expect(page).toHaveURL(/pessoa=/);
  await expect(page.getByRole("heading", { level: 1, name: "Camila Duarte" })).toBeVisible();
  await expect(page.getByText(/em experiência/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Por assunto" })).toBeVisible();
  await page.getByRole("link", { name: "Equipe", exact: true }).first().click();
  await expect(page).not.toHaveURL(/pessoa=/);

  await gotoHydrated(page, "/admin/equipe");
  const anaRow = page.getByRole("row", { name: /Ana Ribeiro/ });
  await anaRow.getByRole("link", { name: "Ver desempenho" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ana Ribeiro" })).toBeVisible();
});
