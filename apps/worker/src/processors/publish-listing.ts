import type { Database } from "@sellbridge/database";
import {
  claimTargetForPublishing,
  getTargetForPublishing,
  markTargetFailed,
  markTargetPublished,
  setTargetCreationStarted,
  type TargetForPublishing,
} from "@sellbridge/database/repositories";
import {
  type ConnectorRegistry,
  isRetryableError,
  type PublishedListing,
  type PublishProductInput,
  type StoreCredentials,
} from "@sellbridge/marketplaces";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { unavailableMessage, unavailableReason } from "@sellbridge/shared/catalog-availability";
import {
  STORE_SUPPLIER_CHANGED_MESSAGE,
  storeSupplierRefusal,
} from "@sellbridge/shared/store-supplier";
import { hasErrorCode, userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { publishListingJobSchema } from "@sellbridge/shared/queues";
import { UnrecoverableError } from "bullmq";
import {
  expireStoreOnAuthError,
  resolveStoreCredentials,
  storeRateKey,
} from "../lib/store-access.ts";
import type { JobContext } from "../lib/job-context.ts";
import { reconcilePublicationStock, unitsToSend } from "./publication-stock.ts";

export interface PublishDependencies {
  database: Database;
  connectors: ConnectorRegistry;
  cipher: TokenCipher;
  /** Waits for the per-store rate limit before calling the marketplace. */
  acquireRateLimit: (key: string) => Promise<void>;
  /** Sellable units never offered on marketplaces (STOCK_SAFETY_UNITS). */
  safetyUnits: number;
  /** Units Shopee listings show on top of the real ones (SHOPEE_SHOWCASE_UNITS). */
  showcaseUnits: number;
}

/** `not_pending`: another job owns the target, or it already failed or is paused. */
export type PublishOutcome = "published" | "paused" | "already_published" | "not_pending";

const UNEXPECTED_FAILURE_REASON = "Erro inesperado ao publicar. Tente reprocessar.";

async function loadTarget(dependencies: PublishDependencies, tenantId: string, targetId: string) {
  try {
    return await getTargetForPublishing(dependencies.database, tenantId, targetId);
  } catch (error) {
    if (hasErrorCode(error, "NOT_FOUND")) {
      throw new UnrecoverableError(`Publicação ${targetId} não encontrada para esta conta`);
    }
    throw error;
  }
}

async function failPermanently(
  dependencies: PublishDependencies,
  targetId: string,
  reason: string,
): Promise<never> {
  await markTargetFailed(dependencies.database, targetId, reason, { final: true });
  throw new UnrecoverableError(reason);
}

/** Only connected stores with an access token can receive new listings. */
function publishingCredentials(
  dependencies: PublishDependencies,
  row: TargetForPublishing,
): StoreCredentials | null {
  if (row.store.status !== "connected") {
    return null;
  }
  return resolveStoreCredentials(dependencies.cipher, row.store);
}

function toPublishProductInput(
  row: TargetForPublishing,
  dependencies: PublishDependencies,
): PublishProductInput {
  return {
    idempotencyKey: row.target.idempotencyKey,
    title: row.listing.title,
    description: row.listing.description,
    priceCents: row.listing.priceCents,
    stock: unitsToSend(row, dependencies),
    sku: row.product.sku,
    imageUrls: row.product.imageUrls,
    mercadoLivreAttributes: row.product.mercadoLivreAttributes,
  };
}

interface PublishAttempt {
  readonly dependencies: PublishDependencies;
  readonly job: JobContext;
  readonly tenantId: string;
  readonly listingTargetId: string;
  readonly row: TargetForPublishing;
  readonly credentials: StoreCredentials;
}

function parsePublishJob(job: JobContext): { tenantId: string; listingTargetId: string } {
  const parsed = publishListingJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError("Payload do job de publicação inválido");
  }
  return parsed.data;
}

async function callMarketplace(attempt: PublishAttempt): Promise<PublishedListing> {
  const { dependencies, row } = attempt;
  const connector = dependencies.connectors[row.store.marketplace];
  try {
    return await connector.publishProduct(
      attempt.credentials,
      toPublishProductInput(row, dependencies),
      {
        creationStartedAt: row.target.creationStartedAt,
        beforeCreate: () => setTargetCreationStarted(dependencies.database, row.target.id, true),
        creationRejected: () =>
          setTargetCreationStarted(dependencies.database, row.target.id, false),
        creationAbsent: () => setTargetCreationStarted(dependencies.database, row.target.id, false),
      },
    );
  } catch (error) {
    return handlePublishFailure(attempt, error);
  }
}

/**
 * The listing already exists on the marketplace here, so a failure must not reach the retry
 * path: another attempt would create a duplicate. The target stays "publishing" and
 * `failStalledPublications` turns it into an error the reseller can check.
 */
async function persistPublishedListing(
  attempt: PublishAttempt,
  result: PublishedListing,
): Promise<void> {
  try {
    await markTargetPublished(attempt.dependencies.database, attempt.listingTargetId, result);
  } catch (error) {
    logger.error("listing.persist_after_publish_failed", {
      tenantId: attempt.tenantId,
      listingTargetId: attempt.listingTargetId,
      externalId: result.externalId,
      error,
    });
    throw new UnrecoverableError(`Anúncio ${result.externalId} criado, mas não foi salvo`);
  }
}

async function publishClaimedTarget(attempt: PublishAttempt): Promise<PublishOutcome> {
  const result = await callMarketplace(attempt);
  await persistPublishedListing(attempt, result);
  const status = await reconcilePublicationStock(attempt.dependencies, {
    tenantId: attempt.tenantId,
    targetId: attempt.listingTargetId,
    sent: {
      stock: unitsToSend(attempt.row, attempt.dependencies),
      priceCents: attempt.row.listing.priceCents,
    },
  });
  logger.info("listing.published", {
    tenantId: attempt.tenantId,
    listingTargetId: attempt.listingTargetId,
    externalId: result.externalId,
  });
  return status === "paused" ? "paused" : "published";
}

async function handlePublishFailure(attempt: PublishAttempt, error: unknown): Promise<never> {
  const { dependencies, job, tenantId, listingTargetId } = attempt;
  const reason = userMessageOr(error, UNEXPECTED_FAILURE_REASON);
  await expireStoreOnAuthError(dependencies.database, attempt.row.store, error);
  const isFinal = !isRetryableError(error) || job.attemptsMade + 1 >= job.maxAttempts;
  await markTargetFailed(dependencies.database, listingTargetId, reason, { final: isFinal });
  logger.warn("listing.publish_failed", { tenantId, listingTargetId, reason, isFinal, error });
  if (isFinal) {
    throw new UnrecoverableError(reason);
  }
  throw error;
}

/** Targets this job must leave alone: already live, owned by another job, failed or paused. */
function outcomeWithoutPublishing(row: TargetForPublishing): PublishOutcome | null {
  if (row.target.status === "published") {
    return "already_published";
  }
  if (row.target.status !== "pending") {
    return "not_pending";
  }
  return null;
}

/**
 * A product deactivated after the job was queued is not sent, nor one whose shop moved to another
 * supplier meanwhile (each shop sells a single supplier).
 */
async function requireSellable(
  dependencies: PublishDependencies,
  row: TargetForPublishing,
): Promise<void> {
  if (row.target.pauseRequested) {
    await failPermanently(
      dependencies,
      row.target.id,
      "This publication was stopped. Restore the product and explicitly retry when ready.",
    );
  }
  const reason = unavailableReason(row.availability);
  if (reason !== null) {
    await failPermanently(dependencies, row.target.id, unavailableMessage(reason));
  }
  if (
    row.source.catalogKind === "supplier" &&
    storeSupplierRefusal(row.store.supplierId, row.product.supplierId) === "other_supplier"
  ) {
    await failPermanently(dependencies, row.target.id, STORE_SUPPLIER_CHANGED_MESSAGE);
  }
}

async function requireCredentials(
  dependencies: PublishDependencies,
  row: TargetForPublishing,
): Promise<StoreCredentials> {
  const credentials = publishingCredentials(dependencies, row);
  if (!credentials) {
    return failPermanently(
      dependencies,
      row.target.id,
      "A loja de destino está desconectada. Reconecte-a e reprocesse.",
    );
  }
  return credentials;
}

/** Waits for the store's rate limit first, so the claim is taken right before the call. */
async function claimWhenRateAllows(
  dependencies: PublishDependencies,
  row: TargetForPublishing,
): Promise<boolean> {
  await dependencies.acquireRateLimit(storeRateKey(row.store));
  return claimTargetForPublishing(dependencies.database, row.target.id);
}

export function createPublishListingProcessor(dependencies: PublishDependencies) {
  return async function processPublishListing(job: JobContext): Promise<PublishOutcome> {
    const { tenantId, listingTargetId } = parsePublishJob(job);
    const row = await loadTarget(dependencies, tenantId, listingTargetId);
    const skipped = outcomeWithoutPublishing(row);
    if (skipped) {
      if (
        row.target.externalId !== null &&
        (row.target.status === "published" || row.target.status === "paused")
      ) {
        await reconcilePublicationStock(dependencies, { tenantId, targetId: listingTargetId });
      }
      return skipped;
    }
    await requireSellable(dependencies, row);
    await requireCredentials(dependencies, row);
    const claimed = await claimWhenRateAllows(dependencies, row);
    if (!claimed) {
      return "not_pending";
    }
    const current = await loadTarget(dependencies, tenantId, listingTargetId);
    await requireSellable(dependencies, current);
    const credentials = await requireCredentials(dependencies, current);
    return publishClaimedTarget({
      dependencies,
      job,
      tenantId,
      listingTargetId,
      row: current,
      credentials,
    });
  };
}
