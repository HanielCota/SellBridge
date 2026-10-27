import { randomBytes } from "node:crypto";
import { DAY_MILLISECONDS } from "@sellbridge/shared/time";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { Database } from "../../client.ts";
import { listingIdempotencyKey } from "../../repositories/listings.ts";
import {
  listings,
  listingTargets,
  orderAdjustments,
  orderItems,
  orders,
  orderStatusChanges,
  storeConnections,
  supplierProducts,
  suppliers,
} from "../../schema/index.ts";
import { DEMO_STORES, type SeedStore } from "./data.ts";
import type { Random } from "./random.ts";
import { behavioursById, REPUTATION_BEHAVIOURS } from "./reputation.ts";

const SIX_HOURS_MILLISECONDS = 6 * 60 * 60 * 1000;
const HISTORY_DAYS = 180;
const DELIVERY_DAYS = 3;
const LISTING_COUNT = 14;

type OrderStatus = (typeof orders.$inferInsert)["status"];
type Product = typeof supplierProducts.$inferSelect;
type Listing = typeof listings.$inferSelect;
type ListingTarget = typeof listingTargets.$inferSelect;

type ReputationBehaviour = (typeof REPUTATION_BEHAVIOURS)[keyof typeof REPUTATION_BEHAVIOURS];

/** Orders still moving; whatever is left after them and the failures is delivered. */
const IN_PROGRESS_WEIGHTS: readonly (readonly [OrderStatus, number])[] = [
  ["shipped", 0.12],
  ["paid", 0.1],
  ["pending", 0.04],
];

/** Cancellations and returns follow the supplier's profile, so the scores differ. */
function statusWeights(behaviour: ReputationBehaviour): (readonly [OrderStatus, number])[] {
  const failures: (readonly [OrderStatus, number])[] = [
    ["cancelled", behaviour.cancelledShare],
    ["returned", behaviour.returnedShare],
  ];
  const used = [...IN_PROGRESS_WEIGHTS, ...failures].reduce((sum, [, weight]) => sum + weight, 0);
  return [["delivered", 1 - used], ...IN_PROGRESS_WEIGHTS, ...failures];
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
] as const;

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

interface DemoOrderInput {
  readonly sale: DemoSale;
  readonly behaviour: ReputationBehaviour;
  readonly ageDays: number;
  readonly sequence: number;
  readonly now: number;
}

function pickStatus(random: Random, ageDays: number, behaviour: ReputationBehaviour): OrderStatus {
  if (ageDays <= 2) {
    return random.chance(0.5) ? "paid" : "pending";
  }
  const roll = random.next();
  let cumulative = 0;
  for (const [status, weight] of statusWeights(behaviour)) {
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

interface DemoStore {
  id: string;
  supplierId: string | null;
}

async function demoSupplierIds(
  database: Database,
  stores: readonly SeedStore[],
): Promise<Map<string, string>> {
  const rows = await database
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(
      inArray(
        suppliers.name,
        stores.map((store) => store.supplierName),
      ),
    );
  return new Map(rows.map((row) => [row.name, row.id]));
}

const EXPIRED_STORE_ERROR = "A loja precisa ser reconectada: o acesso foi revogado ou expirou";

async function ensureDemoStores(
  input: SeedDemoSalesInput,
  stores: readonly SeedStore[],
): Promise<DemoStore[]> {
  const { database, tenantId, cipher } = input;
  const supplierIds = await demoSupplierIds(database, stores);
  await database
    .insert(storeConnections)
    .values(
      stores.map((store) => ({
        tenantId,
        marketplace: "mercado_livre" as const,
        externalShopId: store.externalShopId,
        shopName: store.shopName,
        supplierId: supplierIds.get(store.supplierName) ?? null,
        status: store.status ?? "connected",
        lastError: store.status === "expired" ? EXPIRED_STORE_ERROR : null,
        // Simulated marketplace tokens, encrypted like real ones, so webhooks and sync work.
        accessTokenEnc: cipher.encrypt(simulatedToken("mock-access")),
        refreshTokenEnc: cipher.encrypt(simulatedToken("mock-refresh")),
        expiresAt: new Date(Date.now() + SIX_HOURS_MILLISECONDS),
      })),
    )
    .onConflictDoNothing();
  return database
    .select({ id: storeConnections.id, supplierId: storeConnections.supplierId })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.tenantId, tenantId),
        inArray(
          storeConnections.externalShopId,
          stores.map((store) => store.externalShopId),
        ),
      ),
    );
}

async function chooseDemoProducts(
  database: Database,
  supplierIds: readonly string[],
): Promise<Product[]> {
  if (supplierIds.length === 0) {
    throw new Error("Nenhum fornecedor das lojas demo encontrado no catálogo");
  }
  const rows = await database
    .select({ product: supplierProducts })
    .from(supplierProducts)
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(
      and(
        eq(suppliers.active, true),
        eq(supplierProducts.active, true),
        inArray(supplierProducts.supplierId, [...supplierIds]),
      ),
    )
    .orderBy(asc(supplierProducts.sku))
    .limit(80);
  const products = rows.map((row) => row.product);
  if (products.length === 0) {
    throw new Error("Nenhum produto ativo para a conta demo");
  }
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
      idempotencyKey: listingIdempotencyKey(listing.id, storeConnectionId),
      publishedAt: new Date(Date.now() - HISTORY_DAYS * DAY_MILLISECONDS),
    })
    .returning();
  if (!target) {
    throw new Error("Falha ao criar destino de anúncio demo");
  }
  return target;
}

/** Each product is listed in the demo shops that sell its supplier, and only those. */
async function createDemoListings(
  context: SeedSalesContext,
  stores: readonly DemoStore[],
): Promise<DemoSale[]> {
  const supplierIds = stores.flatMap((store) =>
    store.supplierId === null ? [] : [store.supplierId],
  );
  const products = await chooseDemoProducts(context.database, supplierIds);
  const sales: DemoSale[] = [];
  for (const product of products) {
    const listing = await insertDemoListing(context, product);
    const storesForListing = stores
      .filter((store) => store.supplierId === product.supplierId)
      .map((store) => store.id);
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

interface DemoOrder {
  readonly sale: DemoSale;
  readonly externalOrderId: string;
  readonly status: OrderStatus;
  readonly quantity: number;
  readonly totalCents: number;
  readonly marketplaceFeeCents: number;
  readonly buyerName: string;
  readonly orderedAt: Date;
  readonly deliveredAt: Date | null;
  readonly adjustment: (Adjustment & { readonly createdAt: Date }) | null;
}

/** Delivered demo orders arrive a few days after the order, never later than now. */
function demoDeliveredAt(status: OrderStatus, orderedAt: Date, now: number): Date | null {
  if (status !== "delivered") {
    return null;
  }
  return new Date(Math.min(orderedAt.getTime() + DELIVERY_DAYS * DAY_MILLISECONDS, now));
}

/** Draws one demo order; the order of the random calls keeps seeds reproducible. */
function generateDemoOrder(random: Random, input: DemoOrderInput): DemoOrder {
  const { sale } = input;
  const quantity = random.chance(0.8) ? 1 : random.integerBetween(2, 3);
  const totalCents = sale.listing.priceCents * quantity;
  const status = pickStatus(random, input.ageDays, input.behaviour);
  const dayStart = input.now - input.ageDays * DAY_MILLISECONDS;
  const orderedAt = new Date(dayStart - random.integerBetween(0, DAY_MILLISECONDS - 1));
  const feeBasisPoints = random.integerBetween(1100, 1800);
  const buyerName = random.pick(BUYERS);
  const delayDays = random.integerBetween(2, 10);
  const adjustment = pickAdjustment(random, status, totalCents);
  return {
    sale,
    externalOrderId: `MOCK-ORD-${String(input.sequence).padStart(6, "0")}`,
    status,
    quantity,
    totalCents,
    marketplaceFeeCents: Math.round((totalCents * feeBasisPoints) / 10_000),
    buyerName,
    orderedAt,
    deliveredAt: demoDeliveredAt(status, orderedAt, input.now),
    adjustment: adjustment && {
      ...adjustment,
      createdAt: new Date(orderedAt.getTime() + delayDays * DAY_MILLISECONDS),
    },
  };
}

/** Orders grow over the history window so the dashboard shows a trend. */
function generateDemoOrders(
  random: Random,
  sales: readonly DemoSale[],
  behaviours: ReadonlyMap<string, ReputationBehaviour>,
): DemoOrder[] {
  const now = Date.now();
  const demoOrders: DemoOrder[] = [];
  for (let ageDays = HISTORY_DAYS; ageDays >= 0; ageDays -= 1) {
    const growth = 1 + (HISTORY_DAYS - ageDays) / HISTORY_DAYS;
    const dailyOrders = random.integerBetween(0, Math.round(3 * growth));
    for (let index = 0; index < dailyOrders; index += 1) {
      const sale = random.pick(sales);
      const behaviour = behaviours.get(sale.product.supplierId) ?? REPUTATION_BEHAVIOURS.good;
      demoOrders.push(
        generateDemoOrder(random, {
          sale,
          behaviour,
          ageDays,
          sequence: demoOrders.length + 1,
          now,
        }),
      );
    }
  }
  return demoOrders;
}

async function insertDemoOrder(context: SeedSalesContext, demoOrder: DemoOrder): Promise<void> {
  const { database, tenantId } = context;
  const { sale } = demoOrder;
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: sale.target.storeConnectionId,
      externalOrderId: demoOrder.externalOrderId,
      status: demoOrder.status,
      totalCents: demoOrder.totalCents,
      marketplaceFeeCents: demoOrder.marketplaceFeeCents,
      buyerName: demoOrder.buyerName,
      orderedAt: demoOrder.orderedAt,
      deliveredAt: demoOrder.deliveredAt,
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
    quantity: demoOrder.quantity,
    unitPriceCents: sale.listing.priceCents,
    unitCostCents: sale.product.costCents,
    // Demo history: counted in the seeded shelf already, never held or taken again.
    stockState: "untracked",
  });
  if (demoOrder.adjustment) {
    await database
      .insert(orderAdjustments)
      .values({ tenantId, orderId: order.id, ...demoOrder.adjustment });
  }
  await database
    .insert(orderStatusChanges)
    .values(
      demoStatusChanges(demoOrder).map((change) => ({ tenantId, orderId: order.id, ...change })),
    );
}

/** The order page's progress: the sale, then where the order ended up (when it moved on). */
function demoStatusChanges(demoOrder: DemoOrder) {
  if (demoOrder.status === "pending" || demoOrder.status === "paid") {
    return [{ status: demoOrder.status, changedAt: demoOrder.orderedAt }];
  }
  return [
    { status: "paid" as const, changedAt: demoOrder.orderedAt },
    { status: demoOrder.status, changedAt: demoOrder.deliveredAt ?? demoOrder.orderedAt },
  ];
}

async function seedOrderHistory(
  context: SeedSalesContext,
  sales: readonly DemoSale[],
): Promise<number> {
  const supplierIds = [...new Set(sales.map((sale) => sale.product.supplierId))];
  const behaviours = await behavioursById(context.database, supplierIds);
  const demoOrders = generateDemoOrders(context.random, sales, behaviours);
  for (const demoOrder of demoOrders) {
    await insertDemoOrder(context, demoOrder);
  }
  return demoOrders.length;
}

async function countOrders(database: Database, tenantId: string): Promise<number> {
  const [existing] = await database
    .select({ total: count() })
    .from(orders)
    .where(eq(orders.tenantId, tenantId));
  return existing?.total ?? 0;
}

export interface SeedDemoSalesInput extends SeedSalesContext {
  readonly cipher: TokenCipher;
  /** The tenant's shops; the demo account's by default. */
  readonly stores?: readonly SeedStore[];
}

/** Creates stores, listings and ~6 months of orders for a seeded tenant (idempotent). */
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
  const stores = await ensureDemoStores(input, input.stores ?? DEMO_STORES);
  const sales = await createDemoListings(context, stores);
  const orderCount = await seedOrderHistory(context, sales);
  return { created: true, orders: orderCount };
}
