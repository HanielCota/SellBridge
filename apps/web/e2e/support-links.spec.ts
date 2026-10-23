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

test("a bolha mostra o texto na chegada e depois fica só o ícone", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(page, "/dashboard");
  const bubble = page.getByRole("link", { name: "Falar com o suporte", exact: true });
  await expect(bubble.getByText("Falar com o suporte")).toBeVisible();
  // Folds after 10 seconds of real time (the test clock does not reach React's timer).
  await expect(bubble.getByText("Falar com o suporte")).toBeHidden({ timeout: 15_000 });
  await expect(bubble).toBeVisible();
  // Away from the money pages the form starts at step 1.
  await bubble.click();
  await expect(page).toHaveURL(/\/suporte\/novo(\?perfil=[^&]+)?$/);
});

// The expanded bubble covered "Próxima" and "Operar pedido" at the bottom of the screen; a tap
// meant for them opened support instead.
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`a bolha recolhe na hora quando o texto cobre um botão da página (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signIn(page, DEMO_USER);
    await gotoHydrated(page, "/dashboard");
    const bubble = page.getByRole("link", { name: "Falar com o suporte", exact: true });
    await expect(bubble.getByText("Falar com o suporte")).toBeVisible();

    // A page button lands where the label is, as a list that loads late would put it.
    const box = await bubble.boundingBox();
    if (box === null) {
      throw new Error("bolha sem posição");
    }
    const placeButton = (spot: { left: number; top: number }) =>
      page.evaluate(({ left, top }) => {
        if (document.getElementById("e2e-covered") !== null) {
          return;
        }
        const button = document.createElement("button");
        button.id = "e2e-covered";
        button.textContent = "Próxima";
        button.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:80px;height:40px`;
        document.getElementById("main-content")?.append(button);
      }, spot);

    // Placed again if a late client render replaces the page under it.
    await expect(async () => {
      await placeButton({ left: box.x + 8, top: box.y + 8 });
      await expect(bubble.getByText("Falar com o suporte")).toBeHidden({ timeout: 1_000 });
      await page.getByRole("button", { name: "Próxima" }).click({ trial: true, timeout: 1_000 });
    }).toPass({ timeout: 5_000 });
  });
}

// A table that scrolls sideways can carry a row's button under the label without the page
// itself scrolling or changing.
test("a bolha recolhe quando uma tabela rolada de lado leva um botão para baixo do texto", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, DEMO_USER);
  // The dashboard's own buttons can sit under the label and fold it first; only the strip shows.
  // An adopted sheet adds no node, so hydration is untouched.
  await page.addInitScript(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("#main-content > :not(#e2e-strip) { display: none !important; }");
    document.adoptedStyleSheets = [sheet];
  });
  await gotoHydrated(page, "/dashboard");
  const bubble = page.getByRole("link", { name: "Falar com o suporte", exact: true });
  const label = bubble.getByText("Falar com o suporte");
  await expect(label).toBeVisible();
  const box = await bubble.boundingBox();
  if (box === null) {
    throw new Error("bolha sem posição");
  }

  // The button starts past the right edge of the screen, inside a strip that scrolls sideways.
  const placeStrip = (spot: { left: number; top: number }) =>
    page.evaluate(({ left, top }) => {
      if (document.getElementById("e2e-strip") !== null) {
        return;
      }
      const strip = document.createElement("div");
      strip.id = "e2e-strip";
      strip.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:80px;height:40px;overflow-x:auto`;
      const row = document.createElement("div");
      row.style.cssText = "position:relative;width:2000px;height:40px";
      const button = document.createElement("button");
      button.textContent = "Operar pedido";
      button.style.cssText = "position:absolute;left:1000px;top:0;width:80px;height:40px";
      row.append(button);
      strip.append(row);
      document.getElementById("main-content")?.append(strip);
    }, spot);
  const strip = page.locator("#e2e-strip");

  await placeStrip({ left: box.x + 8, top: box.y + 8 });
  await expect(strip).toBeAttached();
  // Nothing sits under the label yet, so it stays up.
  await expect(label).toBeVisible();

  // Placed again if a late client render replaces the page under it.
  await expect(async () => {
    await placeStrip({ left: box.x + 8, top: box.y + 8 });
    await strip.evaluate((element) => element.scrollTo({ left: 1000 }), undefined, {
      timeout: 1_000,
    });
    await expect(label).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 3_000 });
});
