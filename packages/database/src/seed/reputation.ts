import { tagsForRating } from "@sellbridge/shared/schemas";
import { REVIEW_WINDOW_DAYS } from "@sellbridge/shared/supplier-score";
import { and, count, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { daysBefore } from "../repositories/time-window.ts";
import {
  orderItems,
  orders,
  supplierProducts,
  supplierReviews,
  suppliers,
} from "../schema/index.ts";
import { SUPPLIERS, type SupplierReputationProfile } from "./data.ts";
import type { Random } from "./random.ts";

const DAY_MILLISECONDS = 86_400_000;
/** The newest deliveries stay unreviewed, so the demo has orders waiting for a review. */
const UNREVIEWED_RECENT_DAYS = 10;
const REVIEW_CHANCE = 0.8;

interface ReputationBehaviour {
  /** Chance of 1 to 5 stars, in that order. */
  readonly stars: readonly [number, number, number, number, number];
  readonly cancelledShare: number;
  readonly returnedShare: number;
}

export const REPUTATION_BEHAVIOURS: Record<SupplierReputationProfile, ReputationBehaviour> = {
  excellent: { stars: [0, 0, 0.02, 0.1, 0.88], cancelledShare: 0.01, returnedShare: 0.01 },
  good: { stars: [0.02, 0.03, 0.08, 0.32, 0.55], cancelledShare: 0.02, returnedShare: 0.02 },
  regular: { stars: [0.05, 0.08, 0.22, 0.35, 0.3], cancelledShare: 0.06, returnedShare: 0.05 },
  poor: { stars: [0.18, 0.17, 0.25, 0.22, 0.18], cancelledShare: 0.1, returnedShare: 0.09 },
};

const COMMENTS = {
  praise: [
    "Despachou no mesmo dia, cliente elogiou.",
    "Produto idêntico às fotos, embalagem caprichada.",
    "Fornecedor confiável, respondeu rápido no WhatsApp.",
    "Chegou antes do prazo e bem protegido.",
    "Qualidade acima do esperado pelo preço.",
  ],
  complaint: [
    "Demorou três dias para despachar.",
    "Cor diferente do anúncio, o cliente reclamou.",
    "Caixa chegou amassada.",
    "Demorou para responder sobre o rastreio.",
    "Tamanho veio trocado, precisei negociar com o comprador.",
  ],
} as const;

/** Suppliers of the seed without a profile behave like a good supplier. */
export function behaviourFor(supplierName: string): ReputationBehaviour {
  const seedSupplier = SUPPLIERS.find((supplier) => supplier.name === supplierName);
  return REPUTATION_BEHAVIOURS[seedSupplier?.reputation ?? "good"];
}

/** Behaviour of each supplier id, looked up by the seeded supplier name. */
export async function behavioursById(
  database: Database,
  supplierIds: readonly string[],
): Promise<Map<string, ReputationBehaviour>> {
  const rows = await database
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(inArray(suppliers.id, [...supplierIds]));
  return new Map(rows.map((row) => [row.id, behaviourFor(row.name)]));
}

function drawStars(random: Random, behaviour: ReputationBehaviour): number {
  const roll = random.next();
  let cumulative = 0;
  for (const [index, chance] of behaviour.stars.entries()) {
    cumulative += chance;
    if (roll < cumulative) {
      return index + 1;
    }
  }
  return 5;
}

function drawTags(random: Random, rating: number): string[] {
  const offered = tagsForRating(rating);
  const amount = random.integerBetween(0, 2);
  const tags = new Set<string>();
  for (let index = 0; index < amount; index += 1) {
    tags.add(random.pick(offered));
  }
  return [...tags];
}

function drawComment(random: Random, rating: number): string {
  if (!random.chance(0.45)) {
    return "";
  }
  return random.pick(rating >= 4 ? COMMENTS.praise : COMMENTS.complaint);
}

async function deliveredPairs(database: Database, tenantId: string) {
  return database
    .selectDistinct({
      orderId: orders.id,
      orderedAt: orders.orderedAt,
      supplierId: supplierProducts.supplierId,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(supplierProducts, eq(supplierProducts.id, orderItems.supplierProductId))
    .where(and(eq(orders.tenantId, tenantId), eq(orders.status, "delivered")))
    .orderBy(orders.orderedAt, orders.id, supplierProducts.supplierId);
}

/** Reviews most delivered demo orders, following each supplier's profile (idempotent). */
export async function seedDemoReviews(input: {
  readonly database: Database;
  readonly random: Random;
  readonly tenantId: string;
}): Promise<{ created: boolean; reviews: number }> {
  const { database, random, tenantId } = input;
  const [existing] = await database
    .select({ total: count() })
    .from(supplierReviews)
    .where(eq(supplierReviews.tenantId, tenantId));
  if (existing && existing.total > 0) {
    return { created: false, reviews: existing.total };
  }
  const pairs = await deliveredPairs(database, tenantId);
  const behaviours = await behavioursById(database, [
    ...new Set(pairs.map((pair) => pair.supplierId)),
  ]);
  const unreviewedAfter = daysBefore(UNREVIEWED_RECENT_DAYS);
  const values = pairs
    .filter((pair) => pair.orderedAt < unreviewedAfter && random.chance(REVIEW_CHANCE))
    .map((pair) => {
      const behaviour = behaviours.get(pair.supplierId) ?? REPUTATION_BEHAVIOURS.good;
      const rating = drawStars(random, behaviour);
      const delayDays = random.integerBetween(3, Math.min(9, REVIEW_WINDOW_DAYS));
      const reviewedAt = new Date(pair.orderedAt.getTime() + delayDays * DAY_MILLISECONDS);
      return {
        tenantId,
        orderId: pair.orderId,
        supplierId: pair.supplierId,
        rating,
        tags: drawTags(random, rating),
        comment: drawComment(random, rating),
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      };
    });
  if (values.length > 0) {
    await database.insert(supplierReviews).values(values);
  }
  return { created: true, reviews: values.length };
}
