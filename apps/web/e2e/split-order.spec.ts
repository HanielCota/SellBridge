import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  orderItems,
  orders,
  orderShipments,
  organization,
  storeConnections,
  supplierProducts,
  suppliers,
} from "@sellbridge/database/schema";
import { and, eq } from "drizzle-orm";
import { DEMO_USER, gotoHydrated, signIn } from "./helpers";
import { e2eDatabase } from "./database";
import { giveTestBrand, supplierAccounts } from "./supplier-accounts";

const database = e2eDatabase();
const accounts = supplierAccounts(database);
const RUN = randomUUID().slice(0, 6);
const BUYER = `Dividido ${RUN}`;
let orderId = "";
let otherSupplierId = "";

test.afterAll(async () => {
  // The order first: its parcels hold the suppliers in place.
  if (orderId !== "") await database.delete(orders).where(eq(orders.id, orderId));
  if (otherSupplierId !== "")
    await database.delete(suppliers).where(eq(suppliers.id, otherSupplierId));
  await accounts.removeAll();
  await database.$client.end();
});

async function demoMercadoLivreStore() {
  const [row] = await database
    .select({ tenantId: organization.id, storeId: storeConnections.id })
    .from(organization)
    .innerJoin(storeConnections, eq(storeConnections.tenantId, organization.id))
    .where(
      and(
        eq(organization.slug, "ana-revendedora-demo"),
        eq(storeConnections.marketplace, "mercado_livre"),
        eq(storeConnections.manual, false),
      ),
    )
    .limit(1);
  if (row === undefined) throw new Error("Seed Mercado Livre store missing");
  return row;
}

async function productOf(supplierId: string, title: string) {
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: `DIV-${randomUUID().slice(0, 8)}`,
      title,
      costCents: 2_000,
      suggestedPriceCents: 4_900,
      stock: 10,
      active: true,
      reviewStatus: "approved",
    })
    .returning({ id: supplierProducts.id });
  if (product === undefined) throw new Error("Product missing");
  return product.id;
}

/** A Mercado Livre sale with one product of each supplier, forwarded as one parcel each. */
async function splitSale(parts: readonly { supplierId: string; title: string }[]) {
  const store = await demoMercadoLivreStore();
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: store.tenantId,
      storeConnectionId: store.storeId,
      externalOrderId: `E2E-DIV-${RUN}`,
      status: "paid",
      totalCents: 9_800,
      buyerName: BUYER,
      orderedAt: new Date(),
    })
    .returning({ id: orders.id, externalOrderId: orders.externalOrderId });
  if (order === undefined) throw new Error("Order missing");
  orderId = order.id;
  for (const part of parts) {
    const [item] = await database
      .insert(orderItems)
      .values({
        tenantId: store.tenantId,
        orderId: order.id,
        supplierProductId: await productOf(part.supplierId, part.title),
        title: part.title,
        quantity: 1,
        unitPriceCents: 4_900,
        unitCostCents: 2_000,
      })
      .returning({ id: orderItems.id });
    if (item === undefined) throw new Error("Order item missing");
    await database.insert(orderShipments).values({
      tenantId: store.tenantId,
      orderId: order.id,
      supplierId: part.supplierId,
      status: "forwarded",
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
      items: [{ orderItemId: item.id, title: part.title, sku: "DIV", quantity: 1 }],
    });
  }
  return order;
}

test("um pedido dividido entre fornecedores não mostra etiqueta do Mercado Livre e avisa o revendedor", async ({
  page,
  browser,
}) => {
  test.slow();
  const brand = `Ateliê Dividido ${RUN}`;
  const email = await accounts.signUp(page, brand);
  const supplierId = await giveTestBrand(database, email, brand);
  const [other] = await database
    .insert(suppliers)
    .values({ name: `Outra Marca ${RUN}`, niche: "Teste", state: "SP", city: "Franca" })
    .returning({ id: suppliers.id });
  if (other === undefined) throw new Error("Supplier missing");
  otherSupplierId = other.id;
  const order = await splitSale([
    { supplierId, title: "Vestido dividido" },
    { supplierId: otherSupplierId, title: "Bolsa dividida" },
  ]);

  // The supplier's part shows no pending Mercado Livre label.
  await gotoHydrated(page, `/fornecedor/painel/pedidos?query=${encodeURIComponent(BUYER)}`);
  await page
    .getByRole("button", { name: `Pedido ${order.externalOrderId}` })
    .filter({ visible: true })
    .click();
  const parcel = page.getByRole("dialog");
  await expect(parcel.getByText("Vestido dividido")).toBeVisible();
  await expect(parcel.getByText("Etiqueta pendente")).toHaveCount(0);

  // The reseller reads that each supplier ships its own part.
  const reseller = await (await browser.newContext({ locale: "pt-BR" })).newPage();
  await signIn(reseller, DEMO_USER);
  await gotoHydrated(reseller, `/pedidos/${order.id}`);
  await expect(reseller.getByText("Pedido dividido entre fornecedores")).toBeVisible();
  await expect(
    reseller.getByText("Este pedido tem produtos de 2 fornecedores, e cada um envia a sua parte."),
  ).toBeVisible();
});
