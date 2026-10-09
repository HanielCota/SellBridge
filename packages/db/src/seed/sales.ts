import { and, count, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { getSupplierIdsForRegion } from "../repositories/suppliers.ts";
import {
  listings,
  listingTargets,
  orderAdjustments,
  orderItems,
  orders,
  storeConnections,
  supplierProducts,
} from "../schema/index.ts";
import { DEMO_STORES } from "./data.ts";
import type { Random } from "./random.ts";

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 180;
const LISTING_COUNT = 14;

type OrderStatus = (typeof orders.$inferInsert)["status"];

const STATUS_WEIGHTS: [OrderStatus, number][] = [
  ["delivered", 0.62],
  ["shipped", 0.12],
  ["paid", 0.1],
  ["pending", 0.04],
  ["cancelled", 0.07],
  ["returned", 0.05],
];

function pickStatus(random: Random, ageDays: number): OrderStatus {
  if (ageDays <= 2) {
    return random.chance(0.5) ? "paid" : "pending";
  }
  const roll = random.next();
  let cumulative = 0;
  for (const [status, weight] of STATUS_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) {
      return status;
    }
  }
  return "delivered";
}

const BUYERS = [
  "Mariana S.",
  "João P.",
  "Carla M.",
  "Rafael T.",
  "Beatriz L.",
  "Lucas F.",
  "Fernanda R.",
  "Gustavo A.",
  "Patrícia C.",
  "Diego N.",
];

async function ensureDemoStores(db: Database, tenantId: string) {
  await db
    .insert(storeConnections)
    .values(
      DEMO_STORES.map((store) => ({
        tenantId,
        marketplace: "mock" as const,
        externalShopId: store.externalShopId,
        shopName: store.shopName,
        status: "connected" as const,
      })),
    )
    .onConflictDoNothing();
  return db
    .select({ id: storeConnections.id })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(
          storeConnections.externalShopId,
          DEMO_STORES.map((store) => store.externalShopId),
        ),
      ),
    );
}

async function createDemoListings(
  db: Database,
  random: Random,
  tenantId: string,
  region: { state: string; city: string },
  storeIds: string[],
) {
  const supplierIds = await getSupplierIdsForRegion(db, region);
  if (supplierIds.length === 0) {
    throw new Error("Nenhum fornecedor atende a região da conta demo");
  }
  const products = await db
    .select()
    .from(supplierProducts)
    .where(inArray(supplierProducts.supplierId, supplierIds))
    .limit(80);
  const chosen = products.filter(
    (_, index) => index % Math.ceil(products.length / LISTING_COUNT) === 0,
  );

  const targets = [];
  for (const product of chosen) {
    const priceCents = product.suggestedPriceCents + random.int(-3, 6) * 100;
    const [listing] = await db
      .insert(listings)
      .values({
        tenantId,
        supplierProductId: product.id,
        title: product.title,
        description: product.description,
        priceCents,
      })
      .returning();
    if (!listing) {
      throw new Error("Falha ao criar anúncio demo");
    }
    const storesForListing = random.chance(0.4) ? storeIds : [random.pick(storeIds)];
    for (const storeConnectionId of storesForListing) {
      const [target] = await db
        .insert(listingTargets)
        .values({
          tenantId,
          listingId: listing.id,
          storeConnectionId,
          status: "published",
          externalId: `MOCK-${listing.id.slice(0, 8)}-${storeConnectionId.slice(0, 4)}`,
          attempts: 1,
          idempotencyKey: `${listing.id}:${storeConnectionId}`,
          publishedAt: new Date(Date.now() - HISTORY_DAYS * DAY_MS),
        })
        .returning();
      if (!target) {
        throw new Error("Falha ao criar destino de anúncio demo");
      }
      targets.push({ target, listing, product });
    }
  }
  return targets;
}

/** Creates demo stores, listings and ~6 months of orders for the demo tenant (idempotent). */
export async function seedDemoSales(
  db: Database,
  random: Random,
  tenantId: string,
  region: { state: string; city: string },
): Promise<{ created: boolean; orders: number }> {
  const [existing] = await db
    .select({ total: count() })
    .from(orders)
    .where(eq(orders.tenantId, tenantId));
  if (existing && existing.total > 0) {
    return { created: false, orders: existing.total };
  }

  const stores = await ensureDemoStores(db, tenantId);
  const storeIds = stores.map((store) => store.id);
  const targets = await createDemoListings(db, random, tenantId, region, storeIds);

  let orderCount = 0;
  const now = Date.now();
  for (let ageDays = HISTORY_DAYS; ageDays >= 0; ageDays -= 1) {
    const growth = 1 + (HISTORY_DAYS - ageDays) / HISTORY_DAYS;
    const dailyOrders = random.int(0, Math.round(3 * growth));
    for (let index = 0; index < dailyOrders; index += 1) {
      const sale = random.pick(targets);
      const quantity = random.chance(0.8) ? 1 : random.int(2, 3);
      const totalCents = sale.listing.priceCents * quantity;
      const status = pickStatus(random, ageDays);
      const orderedAt = new Date(now - ageDays * DAY_MS - random.int(0, DAY_MS - 1));
      const feeBps = random.int(1100, 1800);

      const [order] = await db
        .insert(orders)
        .values({
          tenantId,
          storeConnectionId: sale.target.storeConnectionId,
          externalOrderId: `MOCK-ORD-${String(orderCount + 1).padStart(6, "0")}`,
          status,
          totalCents,
          marketplaceFeeCents: Math.round((totalCents * feeBps) / 10_000),
          buyerName: random.pick(BUYERS),
          orderedAt,
        })
        .returning({ id: orders.id });
      if (!order) {
        throw new Error("Falha ao criar pedido demo");
      }
      await db.insert(orderItems).values({
        tenantId,
        orderId: order.id,
        listingTargetId: sale.target.id,
        supplierProductId: sale.product.id,
        title: sale.listing.title,
        quantity,
        unitPriceCents: sale.listing.priceCents,
        unitCostCents: sale.product.costCents,
      });
      await seedAdjustments(db, random, tenantId, order.id, status, totalCents, orderedAt);
      orderCount += 1;
    }
  }
  return { created: true, orders: orderCount };
}

async function seedAdjustments(
  db: Database,
  random: Random,
  tenantId: string,
  orderId: string,
  status: OrderStatus,
  totalCents: number,
  orderedAt: Date,
): Promise<void> {
  const createdAt = new Date(orderedAt.getTime() + random.int(2, 10) * DAY_MS);
  if (status === "returned") {
    await db.insert(orderAdjustments).values({
      tenantId,
      orderId,
      type: "return",
      amountCents: totalCents,
      reason: "Devolução solicitada pelo comprador",
      createdAt,
    });
    return;
  }
  if (status === "delivered" && random.chance(0.03)) {
    await db.insert(orderAdjustments).values({
      tenantId,
      orderId,
      type: "refund",
      amountCents: Math.round(totalCents * 0.3),
      reason: "Reembolso parcial por avaria na embalagem",
      createdAt,
    });
    return;
  }
  if (status === "delivered" && random.chance(0.15)) {
    await db.insert(orderAdjustments).values({
      tenantId,
      orderId,
      type: "commission",
      amountCents: Math.round(totalCents * (random.int(2, 5) / 100)),
      reason: "Bônus de comissão do fornecedor",
      createdAt,
    });
  }
}
