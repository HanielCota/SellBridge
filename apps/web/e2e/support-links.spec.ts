import { expect, test } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import { organization, orders } from "@sellbridge/database/schema";
import { desc, eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";

const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));

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
  await page.getByRole("link", { name: "Falar com o suporte" }).click();

  await expect(page).toHaveURL(/\/suporte\/novo/);
  const about = page.getByRole("region", { name: "Sobre" });
  await expect(about).toContainText(`#${order.externalOrderId}`);
  await expect(page.getByLabel("Assunto")).toHaveValue(`Pedido ${order.externalOrderId}`);
  await expect(page.getByRole("radio", { name: "Pedido" })).toBeChecked();

  await page.getByLabel("Descrição").fill("O comprador disse que recebeu a cor errada.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();

  await expect(page).toHaveURL(/\/suporte\/[0-9a-f-]{36}$/);
  const linked = page.getByRole("region", { name: "Pedidos vinculados" });
  await expect(linked).toContainText(order.externalOrderId);
});

test("recusa um vínculo com pedido que não é da conta", async ({ page }) => {
  await signIn(page, DEMO_USER);
  await gotoHydrated(
    page,
    "/suporte/novo?categoria=order&pedido=00000000-0000-4000-8000-000000000000",
  );
  // Nothing to show for an id outside the account.
  await expect(page.getByRole("region", { name: "Sobre" })).toHaveCount(0);
  await page.getByLabel("Assunto").fill("Pedido de outra conta");
  await page.getByLabel("Descrição").fill("Tentando vincular um pedido que não é meu.");
  await page.getByRole("button", { name: "Abrir chamado" }).click();
  await expect(page.getByRole("alert")).toContainText("Venda não encontrada nesta conta");
  await expect(page).toHaveURL(/\/suporte\/novo/);
});
