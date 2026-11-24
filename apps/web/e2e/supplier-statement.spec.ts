import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  shipmentEvents,
  shipmentPayments,
  storeConnections,
  supplierProducts,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const orderIds: string[] = [];
const DAY_IN_MS = 24 * 60 * 60 * 1000;

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
  const [store] = await database
    .select()
    .from(storeConnections)
    .where(eq(storeConnections.tenantId, tenant?.id ?? ""));
  if (tenant === undefined || store === undefined) {
    throw new Error("Seed demo missing");
  }
  return { tenantId: tenant.id, storeId: store.id };
}

/** A parcel of the demo reseller forwarded to the supplier, with `title` as its only product. */
async function forwardedParcel(supplierId: string, title: string) {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `EXT-${randomUUID().slice(0, 8)}`,
      title,
      costCents: 3_000,
      suggestedPriceCents: 7_900,
      stock: 6,
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) throw new Error("Product missing");
  const { tenantId, storeId } = await demoStore();
  const externalOrderId = `E2E-EXT-${randomUUID().slice(0, 8)}`;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: storeId,
      externalOrderId,
      status: "paid",
      totalCents: 17_800,
      sellerShippingCents: 2_000,
      buyerName: "Paula Ribeiro",
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("Order missing");
  orderIds.push(order.id);
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId,
      orderId: order.id,
      supplierProductId: product.id,
      title,
      quantity: 2,
      unitPriceCents: 7_900,
      unitCostCents: 3_000,
    })
    .returning({ id: orderItems.id });
  if (item === undefined) throw new Error("Order item missing");
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId,
      orderId: order.id,
      supplierId,
      status: "delivered",
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
      items: [{ orderItemId: item.id, title, sku: "EXT-E2E", quantity: 2 }],
    })
    .returning({ id: orderShipments.id });
  if (shipment === undefined) throw new Error("Shipment missing");
  return { shipmentId: shipment.id, externalOrderId };
}

/** R$ 60,00 of products paid by the reseller: 4% is R$ 2,40. */
const PAID = { amountCents: 6_000, platformFeeCents: 240, platformFeeBasisPoints: 400 };

test("o fornecedor vê no extrato cada pedido pago, as taxas e quando o dinheiro libera", async ({
  page,
}) => {
  const email = await accounts.signUp(page, "Cestaria Extrato E2E");
  const supplierId = await giveTestBrand(database, email, "Cestaria Extrato E2E");
  const now = Date.now();
  const delivered = await forwardedParcel(supplierId, "Cesto entregue");
  const released = await forwardedParcel(supplierId, "Cesto liberado");
  const returned = await forwardedParcel(supplierId, "Cesto devolvido");
  const deliveredAt = new Date(now - DAY_IN_MS);
  await database.insert(shipmentEvents).values({
    shipmentId: delivered.shipmentId,
    status: "delivered",
    actor: "marketplace",
    createdAt: deliveredAt,
  });
  await database.insert(shipmentPayments).values([
    {
      shipmentId: delivered.shipmentId,
      supplierId,
      provider: "asaas",
      status: "approved",
      ...PAID,
      paymentMethod: "PIX",
      providerFeeCents: 79,
      escrowStatus: "active",
      paidAt: new Date(now - 3 * 60_000),
    },
    {
      shipmentId: released.shipmentId,
      supplierId,
      provider: "asaas",
      status: "approved",
      ...PAID,
      paymentMethod: "PIX",
      providerFeeCents: null,
      escrowStatus: "done",
      releasedAt: new Date(now),
      paidAt: new Date(now - 2 * 60_000),
    },
    {
      shipmentId: returned.shipmentId,
      supplierId,
      provider: "asaas",
      status: "refunded",
      ...PAID,
      paymentMethod: "PIX",
      refundReason: "cancelled",
      refundRequestedAt: new Date(now),
      paidAt: new Date(now - 60_000),
    },
  ]);

  await gotoHydrated(page, "/fornecedor/painel/recebimentos");
  await page.getByRole("link", { name: "Ver o extrato dos pedidos pagos" }).click();

  await expect(page.getByRole("heading", { name: "Extrato", level: 1 })).toBeVisible();
  const summary = page.getByRole("region", { name: /Você recebe · 2 pedidos pagos/ });
  // R$ 120,00 sold − R$ 4,80 − (R$ 0,79 real + about R$ 1,99 standard) = R$ 112,42.
  await expect(summary.getByText("R$ 112,42")).toBeVisible();
  await expect(summary.getByText("− R$ 4,80")).toBeVisible();
  await expect(summary.getByText("− cerca de R$ 2,78")).toBeVisible();
  await expect(
    summary.getByText(/1 pedido \(R\$\s60,00\) foi ou está sendo devolvido ao revendedor/),
  ).toBeVisible();

  const lines = page.getByRole("list", { name: "Pedidos pagos" }).getByRole("listitem");
  await expect(lines).toHaveCount(3);
  const deliveredLine = lines.filter({ hasText: delivered.externalOrderId });
  await expect(deliveredLine.getByText(/^Libera em /)).toBeVisible();
  await expect(deliveredLine.getByText("R$ 56,81")).toBeVisible();
  await expect(
    lines.filter({ hasText: released.externalOrderId }).getByText(/^Liberado em /),
  ).toBeVisible();
  await expect(
    lines.filter({ hasText: returned.externalOrderId }).getByText(/^Devolvido ao revendedor em /),
  ).toBeVisible();
});

test("fornecedor sem vendas vê o extrato vazio, sem os pedidos de outros", async ({ page }) => {
  const email = await accounts.signUp(page, "Cestaria Sem Vendas E2E");
  await giveTestBrand(database, email, "Cestaria Sem Vendas E2E");

  await gotoHydrated(page, "/fornecedor/painel/extrato");

  await expect(page.getByRole("heading", { name: /Nenhum pedido pago em/ })).toBeVisible();
});

test("revendedor não abre o extrato do fornecedor", async ({ page }) => {
  await signIn(page, DEMO_USER);

  await gotoHydrated(page, "/fornecedor/painel/extrato");

  await expect(page).toHaveURL(/\/dashboard/);
});
