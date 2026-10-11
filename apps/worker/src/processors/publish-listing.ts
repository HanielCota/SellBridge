import type { Database } from "@sellbridge/database";
import {
  claimTargetForPublishing,
  getTargetForPublishing,
  markTargetFailed,
  markTargetPublished,
  markTargetSynced,
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
    stock: row.product.stock,
    sku: row.product.sku,
    imageUrls: row.product.imageUrls,
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
    return await connector.publishProduct(attempt.credentials, toPublishProductInput(row));
  } catch (error) {
    return handlePublishFailure(attempt, error);
  }
}

/**
 * The listing already exists on the marketplace here, so a failure must not reach the retry
 * path: another attempt would create a duplicate. The target stays "publishing" and
 * `failStalledPublications` turns it into an error the reseller can check.
 */
async function savePublished(attempt: PublishAttempt, result: PublishedListing): Promise<void> {
  const { dependencies, row, listingTargetId } = attempt;
  try {
    await markTargetPublished(dependencies.database, listingTargetId, result);
  } catch (error) {
    logger.error("listing.persist_after_publish_failed", {
      tenantId: attempt.tenantId,
      listingTargetId,
      externalId: result.externalId,
      error,
    });
    throw new UnrecoverableError(`Anúncio ${result.externalId} criado, mas não foi salvo`);
  }
  try {
    await markTargetSynced(dependencies.database, listingTargetId, {
      stock: row.product.stock,
      priceCents: row.listing.priceCents,
    });
  } catch (error) {
    // Not fatal: unsynced stock and price differ from the listing, so the sync job sends them.
    logger.warn("listing.initial_sync_not_saved", { listingTargetId, error });
  }
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

export function createPublishListingProcessor(dependencies: PublishDependencies) {
  return async function processPublishListing(job: PublishJobContext): Promise<PublishOutcome> {
    const { tenantId, listingTargetId } = parsePublishJob(job);
    const row = await loadTarget(dependencies, tenantId, listingTargetId);
    if (row.target.status === "published") {
      return "already_published";
    }
    if (row.target.status !== "pending") {
      return "not_pending";
    }
    const credentials = publishingCredentials(dependencies, row);
    if (!credentials) {
      return failPermanently(
        dependencies,
        listingTargetId,
        "A loja de destino está desconectada. Reconecte-a e reprocesse.",
      );
    }

    await dependencies.acquireRateLimit(`${row.store.marketplace}:${row.store.id}`);
    const claimed = await claimTargetForPublishing(dependencies.database, listingTargetId);
    if (!claimed) {
      return "not_pending";
    }
    const attempt: PublishAttempt = {
      dependencies,
      job,
      tenantId,
      listingTargetId,
      row,
      credentials,
    };
    const result = await callMarketplace(attempt);
    await savePublished(attempt, result);
    logger.info("listing.published", { tenantId, listingTargetId, externalId: result.externalId });
    return "published";
  };
}
