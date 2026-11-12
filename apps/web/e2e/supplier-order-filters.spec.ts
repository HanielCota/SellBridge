import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
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
import { and, eq } from "drizzle-orm";
import { gotoHydrated } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const RUN = randomUUID().slice(0, 6);
const BUYER = `Filtro ${RUN}`;
const orderIds: string[] = [];
const HOUR = 3_600_000;

test.afterAll(async () => {
  // Orders first: their parcels hold the supplier in place.
  for (const orderId of orderIds) {
    await database.delete(orders).where(eq(orders.id, orderId));
  }
  await accounts.removeAll();
  await database.$client.end();
});

async function seededReseller(slug: string) {
  const [tenant] = await database
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.slug, slug));
  if (!tenant) throw new Error(`Seed reseller missing: ${slug}`);
  const [store] = await database
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(and(eq(storeConnections.tenantId, tenant.id), eq(storeConnections.manual, false)));
  if (!store) throw new Error(`Seed store missing: ${slug}`);
  return { ...tenant, storeId: store.id };
}

/** A sale of one reseller with its parcel at the supplier; returns the parcel and order ids. */
async function sale(input: {
  reseller: Awaited<ReturnType<typeof seededReseller>>;
  supplierId: string;
  productId: string;
  status: "forwarded" | "ready";
}) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: input.reseller.id,
      storeConnectionId: input.reseller.storeId,
      externalOrderId: `E2E-FILTRO-${randomUUID().slice(0, 8)}`,
      status: "paid",
      totalCents: 9_900,
      buyerName: BUYER,
      orderedAt: new Date(),
    })
    .returning({ id: orders.id, externalOrderId: orders.externalOrderId });
  if (!order) throw new Error("Order missing");
  orderIds.push(order.id);
  const [item] = await database
    .insert(orderItems)
    .values({
      tenantId: input.reseller.id,
      orderId: order.id,
      supplierProductId: input.productId,
      title: "Vestido filtro",
      quantity: 1,
      unitPriceCents: 9_900,
      unitCostCents: 4_000,
    })
    .returning({ id: orderItems.id });
  if (!item) throw new Error("Order item missing");
  const [shipment] = await database
    .insert(orderShipments)
    .values({
      tenantId: input.reseller.id,
      orderId: order.id,
      supplierId: input.supplierId,
      status: input.status,
      address: {
        recipient: BUYER,
        street: "Rua das Flores",
        number: "10",
        complement: "",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        postalCode: "01001-000",
      },
      items: [{ orderItemId: item.id, title: "Vestido filtro", sku: "VES-FIL", quantity: 1 }],
    })
    .returning({ id: orderShipments.id });
  if (!shipment) throw new Error("Shipment missing");
  return { shipmentId: shipment.id, externalOrderId: order.externalOrderId };
}

/** Accepted, label printed and picked, an hour apart, then paid through SellBridge. */
async function workedAndPaid(shipmentId: string, supplierId: string) {
  const start = Date.now() - 4 * HOUR;
  await database.insert(shipmentEvents).values(
    (["forwarded", "accepted", "ready"] as const).map((status, index) => ({
      shipmentId,
      status,
      actor: "Fornecedor",
      createdAt: new Date(start + index * 2 * HOUR),
    })),
  );
  await database
    .update(orderShipments)
    .set({ labelPrintedAt: new Date(start + 3 * HOUR), labelPrintCount: 1 })
    .where(eq(orderShipments.id, shipmentId));
  await database.insert(shipmentPayments).values({
    shipmentId,
    supplierId,
    provider: "mercado_pago",
    status: "approved",
    amountCents: 4_000,
    platformFeeCents: 200,
    platformFeeBasisPoints: 500,
    paidAt: new Date(),
  });
}

function orderRow(page: Page, externalOrderId: string) {
  return page.getByRole("button", { name: `Pedido ${externalOrderId}` }).filter({ visible: true });
}

async function pick(page: Page, filter: string, option: string) {
  await page.getByRole("combobox", { name: filter }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("o fornecedor filtra os pedidos por revendedor e pagamento, e vê as etapas com data", async ({
  page,
}) => {
  const email = await accounts.signUp(page, `Ateliê Filtro ${RUN}`);
  const supplierId = await giveTestBrand(database, email, `Ateliê Filtro ${RUN}`);
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `FIL-${randomUUID().slice(0, 8)}`,
      title: "Vestido filtro",
      costCents: 4_000,
      suggestedPriceCents: 9_900,
      stock: 5,
    })
    .returning({ id: supplierProducts.id });
  if (!product) throw new Error("Product missing");
  const ana = await seededReseller("ana-revendedora-demo");
  const bruno = await seededReseller("bruno-revendedor-demo");
  const paid = await sale({ reseller: ana, supplierId, productId: product.id, status: "ready" });
  await workedAndPaid(paid.shipmentId, supplierId);
  const unpaid = await sale({
    reseller: bruno,
    supplierId,
    productId: product.id,
    status: "forwarded",
  });

  await gotoHydrated(page, `/fornecedor/painel/pedidos?query=${encodeURIComponent(BUYER)}`);
  await expect(orderRow(page, paid.externalOrderId)).toBeVisible();
  await expect(orderRow(page, unpaid.externalOrderId)).toBeVisible();

  await pick(page, "Revendedor", bruno.name);
  await expect(page).toHaveURL(new RegExp(`reseller=${bruno.id}`));
  await expect(orderRow(page, paid.externalOrderId)).toBeHidden();
  await expect(orderRow(page, unpaid.externalOrderId)).toBeVisible();

  await pick(page, "Revendedor", "Todos os revendedores");
  await pick(page, "Pagamento", "Pagos a você");
  await expect(page).toHaveURL(/payment=paid/);
  await expect(orderRow(page, unpaid.externalOrderId)).toBeHidden();
  await expect(orderRow(page, paid.externalOrderId)).toBeVisible();

  // The address keeps the filters: a reload or a shared link shows the same list.
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Pagamento" })).toHaveText("Pagos a você");
  await expect(orderRow(page, unpaid.externalOrderId)).toBeHidden();

  await orderRow(page, paid.externalOrderId).click();
  const dialog = page.getByRole("dialog");
  const steps = dialog.getByRole("list").filter({ hasText: "Etiqueta impressa" });
  await expect(dialog.getByText("Mercado Livre", { exact: true })).toBeVisible();
  await expect(steps.getByRole("listitem")).toHaveText([
    /^Recebido\d{2}\/\d{2}\/\d{4}/,
    /^Aceito\d{2}\/\d{2}\/\d{4}/,
    /^Etiqueta impressa\d{2}\/\d{2}\/\d{4}/,
    /^Separado\d{2}\/\d{2}\/\d{4}/,
    "EnviadoAinda não",
  ]);
});
