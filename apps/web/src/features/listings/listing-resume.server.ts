import {
  findListingsPausedByDisconnection,
  findPausedListings,
  holdListingsBelowPriceFloor,
  type ResumeCandidate,
  resumeStoreListingsPausedByDisconnection,
  setListingsPaused,
} from "@sellbridge/database/repositories";
import { feeChannelOf } from "@sellbridge/shared/channel-fees";
import { conflictError } from "@sellbridge/shared/errors";
import { priceFloorProblemOnChannels } from "@sellbridge/shared/fee-model";
import { logger } from "@sellbridge/shared/logger";
import { feeScheduleFrom } from "@/features/reports/fee-schedule";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { readMercadoLivreRates } from "./mercado-livre-rates.server";

/** What a resume did: stores back on sale, and listings kept paused because they would lose money. */
export interface ResumeOutcome {
  changed: number;
  held: number;
}

/** Why the listing's price would lose money on one of its marketplaces; null when it pays. */
async function priceFloorProblemOf(tenantId: string, candidate: ResumeCandidate) {
  const live = await readMercadoLivreRates(tenantId, {
    productId: candidate.productId,
    storeIds: candidate.storeIds,
  });
  return priceFloorProblemOnChannels(
    candidate.priceCents,
    {
      costCents: candidate.costCents,
      weightGrams: candidate.weightGrams,
      mercadoLivreRates: live?.rates ?? null,
    },
    feeScheduleFrom(environment),
    candidate.marketplaces.map(feeChannelOf),
  );
}

function withoutFinalPeriod(sentence: string): string {
  return sentence.endsWith(".") ? sentence.slice(0, -1) : sentence;
}

/** The candidates split by the price floor, the same rule creating and repricing apply. */
async function splitByPriceFloor(tenantId: string, candidates: readonly ResumeCandidate[]) {
  const paying: string[] = [];
  const losing: { listingId: string; problem: string }[] = [];
  // One listing at a time: each may ask Mercado Livre for its rates.
  for (const candidate of candidates) {
    const problem = await priceFloorProblemOf(tenantId, candidate);
    if (problem === null) {
      paying.push(candidate.listingId);
      continue;
    }
    losing.push({ listingId: candidate.listingId, problem });
  }
  return { paying, losing };
}

/**
 * "Reativar": resumes the chosen listings whose price still pays the cost and every fee; the rest
 * stay paused with that reason. Refused when every paused listing asked would lose money.
 */
export async function resumeListingsForTenant(
  tenantId: string,
  listingIds: readonly string[],
): Promise<ResumeOutcome> {
  const candidates = await findPausedListings(database, tenantId, listingIds);
  const { losing } = await splitByPriceFloor(tenantId, candidates);
  const losingIds = losing.map(({ listingId }) => listingId);
  const [firstLosing] = losing;
  if (firstLosing !== undefined && losing.length === candidates.length) {
    await holdListingsBelowPriceFloor(database, tenantId, { listingIds: losingIds });
    throw conflictError(
      `${withoutFinalPeriod(firstLosing.problem)}. Ajuste o preço para reativar.`,
    );
  }
  await holdListingsBelowPriceFloor(database, tenantId, { listingIds: losingIds });
  const losingSet = new Set(losingIds);
  const resumable = listingIds.filter((id) => !losingSet.has(id));
  const changed =
    resumable.length === 0 ? 0 : await setListingsPaused(database, tenantId, resumable, false);
  return { changed, held: losing.length };
}

/**
 * The reconnection's "Reativar os anúncios": resumes on this store what its disconnection paused,
 * when the price still pays; the rest stays paused with the reason. The reseller's own pauses are
 * never touched.
 */
export async function resumeReconnectedStoreForTenant(
  tenantId: string,
  storeConnectionId: string,
): Promise<ResumeOutcome> {
  const candidates = await findListingsPausedByDisconnection(database, tenantId, storeConnectionId);
  const { paying, losing } = await splitByPriceFloor(tenantId, candidates);
  await holdListingsBelowPriceFloor(database, tenantId, {
    listingIds: losing.map(({ listingId }) => listingId),
    storeConnectionId,
  });
  const changed = await resumeStoreListingsPausedByDisconnection(
    database,
    tenantId,
    storeConnectionId,
    paying,
  );
  logger.info("listing.resumed_after_reconnection", {
    tenantId,
    storeConnectionId,
    resumed: changed,
    held: losing.length,
  });
  return { changed, held: losing.length };
}
