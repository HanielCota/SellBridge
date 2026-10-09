import type { Database } from "@sellbridge/db";
import {
  getTargetForPublishing,
  markStoreStatus,
  markTargetFailed,
  markTargetPublished,
  markTargetPublishing,
  markTargetSynced,
  type TargetForPublishing,
} from "@sellbridge/db/repositories";
import {
  isMarketplaceError,
  MarketplaceAuthError,
  type ConnectorRegistry,
  type TokenCipher,
} from "@sellbridge/marketplaces";
import { isAppError, NotFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { publishListingJobSchema } from "@sellbridge/shared/queues";
import { UnrecoverableError } from "bullmq";

export interface PublishDependencies {
  db: Database;
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

function isRetryable(error: unknown): boolean {
  if (isMarketplaceError(error)) {
    return error.retryable;
  }
  // Unknown errors (bugs, DB blips) get the benefit of the doubt and are retried.
  return true;
}

async function loadTarget(deps: PublishDependencies, tenantId: string, targetId: string) {
  try {
    return await getTargetForPublishing(deps.db, tenantId, targetId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw new UnrecoverableError(`Publicação ${targetId} não encontrada para o tenant`);
    }
    throw error;
  }
}

async function failPermanently(
  deps: PublishDependencies,
  targetId: string,
  reason: string,
): Promise<never> {
  await markTargetFailed(deps.db, targetId, reason, { final: true });
  throw new UnrecoverableError(reason);
}

function storeAccessToken(deps: PublishDependencies, row: TargetForPublishing): string | null {
  if (row.store.status !== "connected" || !row.store.accessTokenEnc) {
    return null;
  }
  return deps.cipher.decrypt(row.store.accessTokenEnc);
}

export function createPublishListingProcessor(deps: PublishDependencies) {
  return async function processPublishListing(job: PublishJobContext): Promise<PublishOutcome> {
    const parsed = publishListingJobSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new UnrecoverableError("Payload do job de publicação inválido");
    }
    const { tenantId, listingTargetId } = parsed.data;
    const row = await loadTarget(deps, tenantId, listingTargetId);
    if (row.target.status === "published") {
      return "already_published";
    }
    const accessToken = storeAccessToken(deps, row);
    if (!accessToken) {
      return failPermanently(
        deps,
        listingTargetId,
        "A loja de destino está desconectada. Reconecte-a e reprocesse.",
      );
    }

    await markTargetPublishing(deps.db, listingTargetId);
    const connector = deps.connectors[row.store.marketplace];
    try {
      await deps.acquireRateLimit(`${row.store.marketplace}:${row.store.id}`);
      const result = await connector.publishProduct(
        { externalShopId: row.store.externalShopId, accessToken },
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
      await markTargetPublished(deps.db, listingTargetId, result);
      await markTargetSynced(deps.db, listingTargetId, {
        stock: row.product.stock,
        priceCents: row.listing.priceCents,
      });
      logger.info("listing.published", {
        tenantId,
        listingTargetId,
        externalId: result.externalId,
      });
      return "published";
    } catch (error) {
      const reason = failureReason(error);
      if (error instanceof MarketplaceAuthError) {
        await markStoreStatus(deps.db, row.store.id, "expired", reason);
      }
      const isFinal = !isRetryable(error) || job.attemptsMade + 1 >= job.maxAttempts;
      await markTargetFailed(deps.db, listingTargetId, reason, { final: isFinal });
      logger.warn("listing.publish_failed", { tenantId, listingTargetId, reason, isFinal, error });
      if (isFinal) {
        throw new UnrecoverableError(reason);
      }
      throw error;
    }
  };
}
