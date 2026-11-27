import { feeChannelOf } from "@sellbridge/shared/channel-fees";
import { MAX_BULK_PUBLISH } from "@sellbridge/shared/schemas";
import { listingsShortBy, type PlanRoom } from "@/features/billing/plan-room";

/**
 * Products not yet listed start ticked, up to what one batch can publish; one already listed
 * would only come back from the review as skipped.
 */
export function initiallyTicked(
  products: readonly { id: string; published: boolean }[],
): ReadonlySet<string> {
  const unlisted = products.filter((product) => !product.published);
  return new Set(unlisted.slice(0, MAX_BULK_PUBLISH).map((product) => product.id));
}

/** The ticked set after one product is ticked or unticked. */
export function withTicked(
  ticked: ReadonlySet<string>,
  productId: string,
  isTicked: boolean,
): ReadonlySet<string> {
  const others = [...ticked].filter((id) => id !== productId);
  return new Set(isTicked ? [...others, productId] : others);
}

/** The stores the review opens ticked: Mercado Livre ones (the local mock stands in for it). */
export function mercadoLivreStoreIds(
  stores: readonly { id: string; marketplace: string }[],
): ReadonlySet<string> {
  return new Set(
    stores
      .filter((store) => feeChannelOf(store.marketplace) === "mercado_livre")
      .map((store) => store.id),
  );
}

/** Whether the ticked products fit the plan, and what to do when they do not. */
export type PlanCheck =
  | { kind: "unlimited"; listings: number }
  | { kind: "no_plan"; listings: number }
  | { kind: "fits"; listings: number; leftAfter: number }
  | { kind: "short"; listings: number; short: number; productsToUntick: number };

/** One listing per ticked product in each ticked store, checked against the plan's room. */
export function checkPlan(room: PlanRoom, productCount: number, storeCount: number): PlanCheck {
  const listings = productCount * storeCount;
  if (room.kind === "unlimited") {
    return { kind: "unlimited", listings };
  }
  if (room.kind === "no_plan") {
    return { kind: "no_plan", listings };
  }
  const short = listingsShortBy(room, listings);
  if (short === 0) {
    return { kind: "fits", listings, leftAfter: room.left.listings - listings };
  }
  return { kind: "short", listings, short, productsToUntick: Math.ceil(short / storeCount) };
}

/** Why "Preparar anúncios" cannot open yet, or null when it can. */
export function blockedReason(tickedCount: number, check: PlanCheck): string | null {
  if (tickedCount === 0) {
    return "Marque pelo menos um produto.";
  }
  if (check.kind === "no_plan") {
    return "Escolha um plano para preparar os anúncios.";
  }
  if (check.kind === "short") {
    return "Desmarque produtos ou mude de plano para continuar.";
  }
  return null;
}
