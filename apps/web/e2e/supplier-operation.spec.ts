import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  shipmentEvents,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { SHIPMENT_ACTORS, type FulfillmentStatus } from "@sellbridge/shared/schemas";
import { eq } from "drizzle-orm";
import { gotoHydrated } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const PRODUCT = `Bolsa de palha e2e ${randomUUID().slice(0, 8)}`;
const HOUR = 3_600_000;
const orderIds: string[] = [];

/** A card of the home, found by its title. */
function card(page: Page, title: string) {
  // The home region holds every card too; the card is the innermost section.
  return page
    .locator("section", { has: page.getByRole("heading", { name: title, exact: true }) })
    .last();
}

test.afterAll(async () => {
  // Orders first: their parcels hold the supplier in place.
  for (const orderId of orderIds) {
    await database.delete(orders).where(eq(orders.id, orderId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

async function demoStore() {
  const [tenant] = await database
    .select()
    .from(organization)
    .where(eq(organization.slug, "ana-revendedora-demo"));
  if (!tenant) throw new Error("Seed demo missing");
  const [store] = await database
    .select()
    .from(storeConnections)
    .where(eq(storeConnections.tenantId, tenant.id));
  if (!store) throw new Error("Seed store missing");
  return { tenantId: tenant.id, storeId: store.id };
}

/**
 * A sale of the demo reseller placed today (one bag at R$ 40 for the supplier), forwarded
 * `forwardedHoursAgo` ago and, when `shippedAfterHours` is given, shipped that long after.
 */
async function sale(input: {
  supplierId: string;
  productId: string;
  forwardedHoursAgo: number;
  shippedAfterHours?: number;
}): Promise<void> {
  const { tenantId, storeId } = await demoStore();
  const shipped = input.shippedAfterHours !== undefined;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: storeId,
      externalOrderId: `E2E-OPERACAO-${randomUUID()}`,
      status: shipped ? "shipped" : "paid",
      totalCents: 9_900,
      buyerName: "Paula Ribeiro",
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (!order) throw new Error("Order missing");
  orderIds.push(order.id);
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId,
      orderId: order.id,
      supplierProductId: input.productId,
      title: "Título do anúncio do revendedor",
      quantity: 1,
      unitPriceCents: 9_900,
      unitCostCents: 4_000,
    })
    .returning({ id: orderItems.id });
  if (!item) throw new Error("Order item missing");
  const status: FulfillmentStatus = shipped ? "shipped" : "forwarded";
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId,
      orderId: order.id,
      supplierId: input.supplierId,
      status,
      address: {
        recipient: "Paula Ribeiro",
        street: "Rua das Flores",
        number: "10",
        complement: "",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        postalCode: "01001-000",
      },
      items: [{ orderItemId: item.id, title: PRODUCT, sku: "BOL-E2E", quantity: 1 }],
    })
    .returning({ id: orderShipments.id });
  if (!shipment) throw new Error("Shipment missing");
  const forwardedAt = new Date(Date.now() - input.forwardedHoursAgo * HOUR);
  const events: { status: FulfillmentStatus; actor: string; createdAt: Date }[] = [
    { status: "forwarded", actor: SHIPMENT_ACTORS.reseller, createdAt: forwardedAt },
  ];
  if (input.shippedAfterHours !== undefined) {
    const at = (hours: number) => new Date(forwardedAt.getTime() + hours * HOUR);
    events.push(
      { status: "accepted", actor: SHIPMENT_ACTORS.supplier, createdAt: at(1) },
      {
        status: "shipped",
        actor: SHIPMENT_ACTORS.supplier,
        createdAt: at(input.shippedAfterHours),
      },
    );
  }
  await database
    .insert(shipmentEvents)
    .values(events.map((event) => ({ shipmentId: shipment.id, ...event })));
}

test("o Início do fornecedor mostra os números da operação e muda com o período", async ({
  page,
}) => {
  const email = await accounts.signUp(page, "Ateliê Operação E2E");
  const supplierId = await giveTestBrand(database, email, "Ateliê Operação E2E");
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `BOL-${randomUUID().slice(0, 8)}`,
      title: PRODUCT,
      costCents: 4_000,
      suggestedPriceCents: 9_900,
      stock: 6,
    })
    .returning({ id: supplierProducts.id });
  if (!product) throw new Error("Product missing");
  // Dispatch within 48 h: one left in 5 h, one in 60 h (late), one still waits for the accept.
  await sale({ supplierId, productId: product.id, forwardedHoursAgo: 72, shippedAfterHours: 5 });
  await sale({ supplierId, productId: product.id, forwardedHoursAgo: 100, shippedAfterHours: 60 });
  await sale({ supplierId, productId: product.id, forwardedHoursAgo: 1 });

  await gotoHydrated(page, "/fornecedor/painel?period=7d");

  const rates = card(page, "Sua operação no período");
  await expect(rates.getByText("Envios atrasados")).toBeVisible();
  await expect(rates).toContainText("50%");
  await expect(rates).toContainText("1 de 2 envios");
  await expect(rates).toContainText("1 dia e 8 h");
  await expect(rates).toContainText("Revendedores ativos1");

  const now = card(page, "Para fazer agora");
  await expect(now.getByRole("link", { name: /Pedidos esperando você\s*1/ })).toHaveAttribute(
    "href",
    /tab=todo/,
  );
  await expect(now.getByRole("link", { name: /Pedidos atrasados\s*0/ })).toBeVisible();

  const months = page.getByRole("list", { name: "Faturamento de cada mês" });
  await expect(months.getByRole("listitem")).toHaveCount(1);
  await expect(months).toContainText("3 pedidos");
  await expect(months).toContainText(/R\$\s120,00/);

  const best = page.getByRole("list", { name: "Produtos mais vendidos no período" });
  await expect(best.getByText(/\d+ unidades? em estoque/)).toBeVisible();

  // The year reads the same parcels; a period before them has nothing to measure.
  await page.locator("label", { hasText: "12 meses" }).click();
  await expect(page.getByRole("radio", { name: "12 meses" })).toBeChecked();
  await expect(page).toHaveURL(/period=365d/);
  await expect(rates).toContainText("1 de 2 envios");
  // The months before the first sale stay out of the list.
  await expect(months.getByRole("listitem")).toHaveCount(1);

  await gotoHydrated(page, "/fornecedor/painel?period=custom&from=2025-01-01&to=2025-01-31");
  await expect(rates).toContainText("Nenhum prazo de envio venceu");
  await expect(rates).toContainText("Nenhum envio no período");
  await expect(card(page, "Faturamento por mês")).toContainText(
    "Quando seus produtos venderem, o valor de cada mês aparece aqui.",
  );
});
