import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Browser, Page } from "@playwright/test";
import { createDatabase } from "@sellbridge/database/client";
import {
  applyMarketplaceShipment,
  forwardOrder,
  upsertStoreConnection,
} from "@sellbridge/database/repositories";
import {
  member,
  orderItems,
  orders,
  returnClaims,
  supplierProducts,
  suppliers,
  user,
} from "@sellbridge/database/schema";
import { eq } from "drizzle-orm";
import { requireEnvironmentVariable } from "./environment";

/** Shared by the return specs: a supplier with its own profile, a reseller, a returned sale. */
export const database = createDatabase(requireEnvironmentVariable("DATABASE_URL"));
export const PHOTO_FIXTURE = fileURLToPath(new URL("./fixtures/avatar.png", import.meta.url));
export const UNIT_COST_CENTS = 3500;

export async function profileOf(email: string): Promise<{ userId: string; tenantId: string }> {
  const [row] = await database
    .select({ userId: user.id, tenantId: member.organizationId })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(eq(user.email, email));
  if (row === undefined) throw new Error(`Conta de teste sem perfil: ${email}`);
  return row;
}

/** The supplier's brand and one product, as the brand step and the panel would create them. */
export async function supplierWithProduct(email: string, name: string) {
  const { tenantId } = await profileOf(email);
  const [supplier] = await database
    .insert(suppliers)
    .values({ name, niche: "Calçados", state: "SP", city: "Franca", organizationId: tenantId })
    .returning();
  if (supplier === undefined) throw new Error("Fornecedor não criado");
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId: supplier.id,
      sku: `RET-${randomUUID().slice(0, 8)}`,
      title: "Tênis Corrida - Preto 40",
      costCents: UNIT_COST_CENTS,
      suggestedPriceCents: 12_000,
      stock: 10,
    })
    .returning();
  if (product === undefined) throw new Error("Produto não criado");
  return product;
}

/**
 * A paid sale of two units, forwarded to the supplier, that the marketplace then reads back.
 * With `shipped`, the marketplace first reports it on its way, so its units left the shelf.
 */
export async function returnedOrder(
  tenantId: string,
  productId: string,
  options: { shipped?: boolean } = {},
) {
  const store = await upsertStoreConnection(database, {
    tenantId,
    marketplace: "mock",
    externalShopId: randomUUID(),
    shopName: "Loja Devoluções",
    accessTokenEnc: "enc-access",
    refreshTokenEnc: "enc-refresh",
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  const externalOrderId = `E2E-RET-${randomUUID().slice(0, 8)}`;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId,
      status: "paid",
      totalCents: 24_000,
      buyerName: "Carla Mendes",
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("Pedido não criado");
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    supplierProductId: productId,
    title: "Tênis Corrida - Preto 40",
    quantity: 2,
    unitPriceCents: 12_000,
    unitCostCents: UNIT_COST_CENTS,
  });
  await forwardOrder(database, tenantId, {
    orderId: order.id,
    address: {
      recipient: "Carla Mendes",
      street: "Rua das Flores",
      number: "100",
      complement: "",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      postalCode: "01001-000",
    },
    notes: "",
  });
  if (options.shipped === true) {
    await applyMarketplaceShipment(database, tenantId, order.id, {
      status: "shipped",
      trackingStatus: "shipped",
      buyerReturnDelivered: false,
      carrier: "Mercado Envios",
      trackingCode: "ML-RET-1",
    });
  }
  // What the tracking job does when Mercado Livre says the parcel came back.
  await applyMarketplaceShipment(database, tenantId, order.id, {
    status: "not_delivered",
    trackingStatus: "returned",
    buyerReturnDelivered: false,
    carrier: "Mercado Envios",
    trackingCode: "ML-RET-1",
  });
  return { orderId: order.id, externalOrderId };
}

export async function claimTicketId(orderId: string): Promise<string> {
  const [claim] = await database
    .select({ ticketId: returnClaims.ticketId })
    .from(returnClaims)
    .where(eq(returnClaims.orderId, orderId));
  if (claim?.ticketId === undefined || claim.ticketId === null) {
    throw new Error("Devolução sem chamado");
  }
  return claim.ticketId;
}

export async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "pt-BR" });
  return context.newPage();
}
