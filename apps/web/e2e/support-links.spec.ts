import { expect, test } from "@playwright/test";
import { organization, orders } from "@sellbridge/database/schema";
import { desc, eq } from "drizzle-orm";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";

const database = e2eDatabase();

test.afterAll(async () => {
  await database.$client.end();
});

/** The newest order of the seeded demo tenant. */
async function demoOrder() {
  const [row] = await database
    .select({ id: orders.id, externalOrderId: orders.externalOrderId })
    .from(orders)
    .innerJoin(organization, eq(organization.id, orders.tenantId))
    .where(eq(organization.slug, "ana-revendedora-demo"))
    .orderBy(desc(orders.orderedAt))
    .limit(1);
  if (row === undefined) throw new Error("Seed demo missing");
  return row;
}

test("abre um chamado já ligado ao pedido pela página do pedido", async ({ page }) => {
  const order = await demoOrder();
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, `/pedidos/${order.id}`);
  // The page's own button carries the order; the corner bubble only opens the form.
  await page.getByRole("main").getByRole("link", { name: "Falar com o suporte" }).click();

  await expect(page).toHaveURL(/\/suporte\/novo/);
  const about = page.getByRole("region", { name: "Sobre" });
  await expect(about).toContainText(`#${order.externalOrderId}`);
  // The topic came with the link: the flow starts at what is going on.
  await expect(page.getByText("1. Pedido ou entrega")).toBeVisible();
  await page.getByRole("button", { name: /^Chegou errado ou quebrado/ }).click();
  await page
    .getByLabel("O que chegou diferente do que foi vendido?")
    .fill("O comprador disse que recebeu a cor errada.");
  await page.getByRole("button", { name: "Enviar chamado" }).click();

  await expect(page).toHaveURL(/\/suporte\/[0-9a-f-]{36}\?perfil=[a-z0-9-]+$/);
  await expect(
    page.getByRole("heading", { name: "Chegou errado ou quebrado", exact: true }),
  ).toBeVisible();
  // The order the ticket came from shows under the title, no picking needed.
  await expect(page.getByText(`Pedido #${order.externalOrderId}`, { exact: true })).toBeVisible();
});

test("recusa um vínculo com pedido que não é da conta", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(
    page,
    "/suporte/novo?categoria=order&pedido=00000000-0000-4000-8000-000000000000",
  );
  // Nothing to show for an id outside the account.
  await expect(page.getByRole("region", { name: "Sobre" })).toHaveCount(0);
  await page.getByRole("button", { name: /^O pedido atrasou/ }).click();
  await page
    .getByLabel("O que aconteceu com a entrega?")
    .fill("Tentando vincular um pedido que não é meu.");
  await page.getByRole("button", { name: "Enviar chamado" }).click();
  await expect(page.getByRole("alert")).toContainText("Venda não encontrada nesta conta");
  await expect(page).toHaveURL(/\/suporte\/novo/);
});

// Money questions start from where the reseller sees the money: the corner bubble picks the topic.
for (const from of ["/financeiro", "/assinatura"]) {
  test(`abre o chamado de dinheiro já no tema a partir de ${from}`, async ({ page }) => {
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, from);
    await page.getByRole("link", { name: "Falar com o suporte" }).click();
    await expect(page).toHaveURL(/\/suporte\/novo\?categoria=payment/);
    await expect(page.getByText("1. Dinheiro das vendas ou cobrança")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^O dinheiro de uma venda não caiu/ }),
    ).toBeVisible();
  });
}

/*
 * Board 4, approved on 2026-10-25: the bubble stays round, its name only for screen readers and
 * in the hint, and the page ends with room for it, so it never sits over the last control. It
 * replaces the label that opened on arrival and folded when it covered a button.
 */
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`a bolha fica só com o ícone e o fim da página passa acima dela (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/pedidos?view=reviews");
    await expect(page.getByRole("button", { name: /Avaliar/ }).first()).toBeVisible();
    const bubble = page.getByRole("link", { name: "Falar com o suporte", exact: true });
    await expect(bubble).toBeVisible();
    await expect(bubble.getByText("Falar com o suporte")).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const covered = await bubble.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const controls = document.querySelectorAll("#main-content a[href], #main-content button");
      return Array.from(controls).some((control) => {
        const area = control.getBoundingClientRect();
        const hasSize = area.width > 0 && area.height > 0;
        const across = area.left < box.right && box.left < area.right;
        const along = area.top < box.bottom && box.top < area.bottom;
        return hasSize && across && along;
      });
    });
    expect(covered).toBe(false);

    await bubble.click();
    await expect(page).toHaveURL(/\/suporte\/novo(\?perfil=[^&]+)?$/);
  });
}

test("volta para Publicações com o filtro de onde o chamado foi aberto", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/publicacoes?status=published");
  await page
    .getByRole("button", { name: /^Ações de / })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Falar com o suporte" }).click();
  await expect(page).toHaveURL(/\/suporte\/novo\?categoria=listing/);

  // The form spans the page like the navigation bar: its left edge lines up with the logo.
  const logo = await page.getByRole("link", { name: "SellBridge, visão geral" }).boundingBox();
  const form = await page.locator("form").boundingBox();
  expect(Math.abs((form?.x ?? 0) - (logo?.x ?? 0))).toBeLessThan(40);
  expect(form?.width ?? 0).toBeGreaterThan(1100);

  await page.getByRole("main").getByRole("link", { name: "Publicações", exact: true }).click();
  await expect(page).toHaveURL(/\/publicacoes\?.*status=published/);
});

test("abre a conversa com o fornecedor pelo menu do anúncio", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/publicacoes?status=published");
  await page
    .getByRole("button", { name: /^Ações de / })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Falar com o fornecedor" }).click();
  await expect(page).toHaveURL(/\/suporte\/fornecedores\/novo\?loja=[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Falar com o fornecedor" })).toBeVisible();
});

test("abre a conversa com o fornecedor pelo menu da loja", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/lojas");
  await page.getByRole("button", { name: "Opções de Ana Moda" }).click();
  await page.getByRole("menuitem", { name: "Falar com o fornecedor" }).click();
  await expect(page).toHaveURL(/\/suporte\/fornecedores\/novo\?loja=[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Falar com o fornecedor" })).toBeVisible();
});
