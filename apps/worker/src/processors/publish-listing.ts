import type { Database } from "@sellbridge/database";
import {
  getTargetForPublishing,
  markStoreStatus,
  markTargetFailed,
  markTargetPublished,
  markTargetPublishing,
  markTargetSynced,
  type TargetForPublishing,
} from "@sellbridge/database/repositories";
import {
  type ConnectorRegistry,
  isMarketplaceAuthError,
  isRetryableError,
  type TokenCipher,
} from "@sellbridge/marketplaces";
import { hasErrorCode, isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { publishListingJobSchema } from "@sellbridge/shared/queues";
import { UnrecoverableError } from "bullmq";

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

export type PublishOutcome = "published" | "already_published";

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

function storeAccessToken(
  dependencies: PublishDependencies,
  row: TargetForPublishing,
): string | null {
  if (row.store.status !== "connected" || !row.store.accessTokenEnc) {
    return null;
  }
  return dependencies.cipher.decrypt(row.store.accessTokenEnc);
}

interface PublishAttempt {
  readonly dependencies: PublishDependencies;
  readonly job: PublishJobContext;
  readonly tenantId: string;
  readonly listingTargetId: string;
  readonly row: TargetForPublishing;
  readonly accessToken: string;
}

function parsePublishJob(job: PublishJobContext): { tenantId: string; listingTargetId: string } {
  const parsed = publishListingJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError("Payload do job de publicação inválido");
  }
  return parsed.data;
}

async function publishToMarketplace(attempt: PublishAttempt): Promise<PublishOutcome> {
  const { dependencies, row, listingTargetId } = attempt;
  const connector = dependencies.connectors[row.store.marketplace];
  await dependencies.acquireRateLimit(`${row.store.marketplace}:${row.store.id}`);
  const result = await connector.publishProduct(
    { externalShopId: row.store.externalShopId, accessToken: attempt.accessToken },
    {
      idempotencyKey: row.target.idempotencyKey,
      title: row.listing.title,
      description: row.listing.description,
      priceCents: row.listing.priceCents,
      stock: row.product.stock,
      sku: row.product.sku,
      imageUrls: row.product.imageUrls,
    },
  );
  await markTargetPublished(dependencies.database, listingTargetId, result);
  await markTargetSynced(dependencies.database, listingTargetId, {
    stock: row.product.stock,
    priceCents: row.listing.priceCents,
  });
  logger.info("listing.published", {
    tenantId: attempt.tenantId,
    listingTargetId,
    externalId: result.externalId,
  });
  return "published";
}

async function handlePublishFailure(attempt: PublishAttempt, error: unknown): Promise<never> {
  const { dependencies, job, tenantId, listingTargetId } = attempt;
  const reason = failureReason(error);
  if (isMarketplaceAuthError(error)) {
    await markStoreStatus(dependencies.database, attempt.row.store.id, "expired", reason);
  }
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
    const accessToken = storeAccessToken(dependencies, row);
    if (!accessToken) {
      return failPermanently(
        dependencies,
        listingTargetId,
        "A loja de destino está desconectada. Reconecte-a e reprocesse.",
      );
    }

    await markTargetPublishing(dependencies.database, listingTargetId);
    const attempt: PublishAttempt = {
      dependencies,
      job,
      tenantId,
      listingTargetId,
      row,
      accessToken,
    };
    try {
      return await publishToMarketplace(attempt);
    } catch (error) {
      return handlePublishFailure(attempt, error);
    }
  };
}
