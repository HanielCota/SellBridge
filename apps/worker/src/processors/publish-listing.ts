import type { Database } from "@sellbridge/database";
import {
  claimTargetForPublishing,
  getTargetForPublishing,
  markTargetFailed,
  markTargetPublished,
  markTargetSynced,
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
import { hasErrorCode, isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { availableUnits } from "@sellbridge/shared/stock-reservation";
import { publishListingJobSchema } from "@sellbridge/shared/queues";
import { UnrecoverableError } from "bullmq";
import { expireStoreOnAuthError, resolveStoreCredentials } from "../lib/store-access.ts";

export interface PublishDependencies {
  database: Database;
  connectors: ConnectorRegistry;
  cipher: TokenCipher;
  /** Waits for the per-store rate limit before calling the marketplace. */
  acquireRateLimit: (key: string) => Promise<void>;
}

export interface PublishJobContext {
  data: unknown;
  /** Attempts already made before this one (BullMQ `job.attemptsMade`). */
  attemptsMade: number;
  maxAttempts: number;
}

/** `not_pending`: another job owns the target, or it already failed or is paused. */
export type PublishOutcome = "published" | "already_published" | "not_pending";

function failureReason(error: unknown): string {
  if (isAppError(error)) {
    return error.userMessage;
  }
  return "Erro inesperado ao publicar. Tente reprocessar.";
}

async function loadTarget(dependencies: PublishDependencies, tenantId: string, targetId: string) {
  try {
    return await getTargetForPublishing(dependencies.database, tenantId, targetId);
  } catch (error) {
    if (hasErrorCode(error, "NOT_FOUND")) {
      throw new UnrecoverableError(`Publicação ${targetId} não encontrada para o tenant`);
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

function toPublishProductInput(row: TargetForPublishing): PublishProductInput {
  return {
    idempotencyKey: row.target.idempotencyKey,
    title: row.listing.title,
    description: row.listing.description,
    priceCents: row.listing.priceCents,
    stock: availableUnits(row.product.stock, row.product.reservedStock),
    sku: row.product.sku,
    imageUrls: row.product.imageUrls,
    mercadoLivreAttributes: row.product.mercadoLivreAttributes,
  };
}

interface PublishAttempt {
  readonly dependencies: PublishDependencies;
  readonly job: PublishJobContext;
  readonly tenantId: string;
  readonly listingTargetId: string;
  readonly row: TargetForPublishing;
  readonly credentials: StoreCredentials;
}

function parsePublishJob(job: PublishJobContext): { tenantId: string; listingTargetId: string } {
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
    return await connector.publishProduct(attempt.credentials, toPublishProductInput(row), {
      reconcileOnly: row.target.creationStartedAt != null,
      beforeCreate: () => setTargetCreationStarted(dependencies.database, row.target.id, true),
      creationRejected: () => setTargetCreationStarted(dependencies.database, row.target.id, false),
    });
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

/** Not fatal: unsaved stock and price differ from the listing, so the sync job sends them. */
async function recordInitialSync(attempt: PublishAttempt): Promise<void> {
  const { dependencies, row, listingTargetId } = attempt;
  try {
    await markTargetSynced(dependencies.database, listingTargetId, {
      stock: availableUnits(row.product.stock, row.product.reservedStock),
      priceCents: row.listing.priceCents,
    });
  } catch (error) {
    logger.warn("listing.initial_sync_not_saved", { listingTargetId, error });
  }
}

async function publishClaimedTarget(attempt: PublishAttempt): Promise<PublishOutcome> {
  const result = await callMarketplace(attempt);
  await persistPublishedListing(attempt, result);
  await recordInitialSync(attempt);
  logger.info("listing.published", {
    tenantId: attempt.tenantId,
    listingTargetId: attempt.listingTargetId,
    externalId: result.externalId,
  });
  return "published";
}

async function handlePublishFailure(attempt: PublishAttempt, error: unknown): Promise<never> {
  const { dependencies, job, tenantId, listingTargetId } = attempt;
  const reason = failureReason(error);
  await expireStoreOnAuthError(dependencies.database, attempt.row.store.id, error);
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
  await dependencies.acquireRateLimit(`${row.store.marketplace}:${row.store.id}`);
  return claimTargetForPublishing(dependencies.database, row.target.id);
}

export function createPublishListingProcessor(dependencies: PublishDependencies) {
  return async function processPublishListing(job: PublishJobContext): Promise<PublishOutcome> {
    const { tenantId, listingTargetId } = parsePublishJob(job);
    const row = await loadTarget(dependencies, tenantId, listingTargetId);
    const skipped = outcomeWithoutPublishing(row);
    if (skipped) {
      return skipped;
    }
    const credentials = await requireCredentials(dependencies, row);
    const claimed = await claimWhenRateAllows(dependencies, row);
    if (!claimed) {
      return "not_pending";
    }
    return publishClaimedTarget({ dependencies, job, tenantId, listingTargetId, row, credentials });
  };
}
