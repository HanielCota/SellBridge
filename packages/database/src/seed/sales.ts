import { randomBytes } from "node:crypto";
import type { TokenCipher } from "@sellbridge/marketplaces";
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

const DAY_MILLISECONDS = 86_400_000;
const SIX_HOURS_MILLISECONDS = 6 * 60 * 60 * 1000;
const HISTORY_DAYS = 180;
const LISTING_COUNT = 14;

type OrderStatus = (typeof orders.$inferInsert)["status"];
type Product = typeof supplierProducts.$inferSelect;
type Listing = typeof listings.$inferSelect;
type ListingTarget = typeof listingTargets.$inferSelect;

const STATUS_WEIGHTS: readonly (readonly [OrderStatus, number])[] = [
  ["delivered", 0.62],
  ["shipped", 0.12],
  ["paid", 0.1],
  ["pending", 0.04],
  ["cancelled", 0.07],
  ["returned", 0.05],
];

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
] as const;

interface Region {
  readonly state: string;
  readonly city: string;
}

interface SeedSalesContext {
  readonly database: Database;
  readonly random: Random;
  readonly tenantId: string;
}

interface DemoSale {
  readonly target: ListingTarget;
  readonly listing: Listing;
  readonly product: Product;
}

interface Adjustment {
  readonly type: "return" | "refund" | "commission";
  readonly amountCents: number;
  readonly reason: string;
}

interface OrderPlacement {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly totalCents: number;
  readonly orderedAt: Date;
}

interface DemoOrderInput {
  readonly sale: DemoSale;
  readonly ageDays: number;
  readonly sequence: number;
  readonly now: number;
}

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

function simulatedToken(prefix: string): string {
  return `${prefix}-${randomBytes(12).toString("hex")}`;
}

async function ensureDemoStores(database: Database, tenantId: string, cipher: TokenCipher) {
  await database
    .insert(storeConnections)
    .values(
      DEMO_STORES.map((store) => ({
        tenantId,
        marketplace: "mock" as const,
        externalShopId: store.externalShopId,
        shopName: store.shopName,
        status: "connected" as const,
        // Simulated marketplace tokens, encrypted like real ones, so webhooks and sync work.
        accessTokenEnc: cipher.encrypt(simulatedToken("mock-access")),
        refreshTokenEnc: cipher.encrypt(simulatedToken("mock-refresh")),
        expiresAt: new Date(Date.now() + SIX_HOURS_MILLISECONDS),
      })),
    )
    .onConflictDoNothing();
  return database
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

async function chooseDemoProducts(database: Database, region: Region): Promise<Product[]> {
  const supplierIds = await getSupplierIdsForRegion(database, region);
  if (supplierIds.length === 0) {
    throw new Error("Nenhum fornecedor atende a região da conta demo");
  }
  const products = await database
    .select()
    .from(supplierProducts)
    .where(inArray(supplierProducts.supplierId, supplierIds))
    .limit(80);
  const step = Math.ceil(products.length / LISTING_COUNT);
  return products.filter((_, index) => index % step === 0);
}

async function insertDemoListing(context: SeedSalesContext, product: Product): Promise<Listing> {
  const [listing] = await context.database
    .insert(listings)
    .values({
      tenantId: context.tenantId,
      supplierProductId: product.id,
      title: product.title,
      description: product.description,
      priceCents: product.suggestedPriceCents + context.random.integerBetween(-3, 6) * 100,
    })
    .returning();
  if (!listing) {
    throw new Error("Falha ao criar anúncio demo");
  }
  return listing;
}

async function insertPublishedTarget(
  context: SeedSalesContext,
  listing: Listing,
  storeConnectionId: string,
): Promise<ListingTarget> {
  const [target] = await context.database
    .insert(listingTargets)
    .values({
      tenantId: context.tenantId,
      listingId: listing.id,
      storeConnectionId,
      status: "published",
      externalId: `MOCK-${listing.id.slice(0, 8)}-${storeConnectionId.slice(0, 4)}`,
      attempts: 1,
      idempotencyKey: `${listing.id}:${storeConnectionId}`,
      publishedAt: new Date(Date.now() - HISTORY_DAYS * DAY_MILLISECONDS),
    })
    .returning();
  if (!target) {
    throw new Error("Falha ao criar destino de anúncio demo");
  }
  return target;
}

async function createDemoListings(
  context: SeedSalesContext,
  region: Region,
  storeIds: readonly string[],
): Promise<DemoSale[]> {
  const products = await chooseDemoProducts(context.database, region);
  const sales: DemoSale[] = [];
  for (const product of products) {
    const listing = await insertDemoListing(context, product);
    const storesForListing = context.random.chance(0.4)
      ? storeIds
      : [context.random.pick(storeIds)];
    for (const storeConnectionId of storesForListing) {
      const target = await insertPublishedTarget(context, listing, storeConnectionId);
      sales.push({ target, listing, product });
    }
  }
  return sales;
}

function pickAdjustment(
  random: Random,
  status: OrderStatus,
  totalCents: number,
): Adjustment | null {
  if (status === "returned") {
    return {
      type: "return",
      amountCents: totalCents,
      reason: "Devolução solicitada pelo comprador",
    };
  }
  if (status !== "delivered") {
    return null;
  }
  if (random.chance(0.03)) {
    return {
      type: "refund",
      amountCents: Math.round(totalCents * 0.3),
      reason: "Reembolso parcial por avaria na embalagem",
    };
  }
  if (random.chance(0.15)) {
    return {
      type: "commission",
      amountCents: Math.round(totalCents * (random.integerBetween(2, 5) / 100)),
      reason: "Bônus de comissão do fornecedor",
    };
  }
  return null;
}

async function seedAdjustment(context: SeedSalesContext, placement: OrderPlacement): Promise<void> {
  const delayDays = context.random.integerBetween(2, 10);
  const createdAt = new Date(placement.orderedAt.getTime() + delayDays * DAY_MILLISECONDS);
  const adjustment = pickAdjustment(context.random, placement.status, placement.totalCents);
  if (!adjustment) {
    return;
  }
  await context.database.insert(orderAdjustments).values({
    tenantId: context.tenantId,
    orderId: placement.orderId,
    ...adjustment,
    createdAt,
  });
}

async function insertDemoOrder(context: SeedSalesContext, input: DemoOrderInput): Promise<void> {
  const { database, random, tenantId } = context;
  const { sale } = input;
  const quantity = random.chance(0.8) ? 1 : random.integerBetween(2, 3);
  const totalCents = sale.listing.priceCents * quantity;
  const status = pickStatus(random, input.ageDays);
  const dayStart = input.now - input.ageDays * DAY_MILLISECONDS;
  const orderedAt = new Date(dayStart - random.integerBetween(0, DAY_MILLISECONDS - 1));
  const feeBasisPoints = random.integerBetween(1100, 1800);

  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: sale.target.storeConnectionId,
      externalOrderId: `MOCK-ORD-${String(input.sequence).padStart(6, "0")}`,
      status,
      totalCents,
      marketplaceFeeCents: Math.round((totalCents * feeBasisPoints) / 10_000),
      buyerName: random.pick(BUYERS),
      orderedAt,
    })
    .returning({ id: orders.id });
  if (!order) {
    throw new Error("Falha ao criar pedido demo");
  }
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    listingTargetId: sale.target.id,
    supplierProductId: sale.product.id,
    title: sale.listing.title,
    quantity,
    unitPriceCents: sale.listing.priceCents,
    unitCostCents: sale.product.costCents,
  });
  await seedAdjustment(context, { orderId: order.id, status, totalCents, orderedAt });
}

/** Orders grow over the history window so the dashboard shows a trend. */
async function seedOrderHistory(
  context: SeedSalesContext,
  sales: readonly DemoSale[],
): Promise<number> {
  const now = Date.now();
  let sequence = 0;
  for (let ageDays = HISTORY_DAYS; ageDays >= 0; ageDays -= 1) {
    const growth = 1 + (HISTORY_DAYS - ageDays) / HISTORY_DAYS;
    const dailyOrders = context.random.integerBetween(0, Math.round(3 * growth));
    for (let index = 0; index < dailyOrders; index += 1) {
      sequence += 1;
      const sale = context.random.pick(sales);
      await insertDemoOrder(context, { sale, ageDays, sequence, now });
    }
  }
  return sequence;
}

async function countOrders(database: Database, tenantId: string): Promise<number> {
  const [existing] = await database
    .select({ total: count() })
    .from(orders)
    .where(eq(orders.tenantId, tenantId));
  return existing?.total ?? 0;
}

export interface SeedDemoSalesInput extends SeedSalesContext {
  readonly region: Region;
  readonly cipher: TokenCipher;
}

/** Creates demo stores, listings and ~6 months of orders for the demo tenant (idempotent). */
export async function seedDemoSales(
  input: SeedDemoSalesInput,
): Promise<{ created: boolean; orders: number }> {
  const existingOrders = await countOrders(input.database, input.tenantId);
  if (existingOrders > 0) {
    return { created: false, orders: existingOrders };
  }
  const context: SeedSalesContext = {
    database: input.database,
    random: input.random,
    tenantId: input.tenantId,
  };
  const stores = await ensureDemoStores(input.database, input.tenantId, input.cipher);
  const storeIds = stores.map((store) => store.id);
  const sales = await createDemoListings(context, input.region, storeIds);
  const orderCount = await seedOrderHistory(context, sales);
  return { created: true, orders: orderCount };
}
