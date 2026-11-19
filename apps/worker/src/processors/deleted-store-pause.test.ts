import {
  marketplaceAuthError,
  marketplaceListingEndedError,
  type StockPriceUpdate,
} from "@sellbridge/marketplaces";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { UnrecoverableError } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { createDeletedStorePauseProcessor } from "./deleted-store-pause.ts";

vi.mock("@sellbridge/shared/logger", () => ({
  logger: {
    info: vi.fn<(event: string, fields?: unknown) => void>(),
    warn: vi.fn<(event: string, fields?: unknown) => void>(),
    error: vi.fn<(event: string, fields?: unknown) => void>(),
  },
}));

const cipher = createTokenCipher(Buffer.alloc(32, 7).toString("base64"));

function jobFor(externalIds: readonly string[]) {
  return {
    data: {
      tenantId: "0b0d6f6c-3a43-4a3e-9d5b-6d1f7f3c2a10",
      storeConnectionId: "6a2b8c4d-1e3f-4a5b-8c7d-9e0f1a2b3c4d",
      marketplace: "mercado_livre",
      externalShopId: "shop-1",
      accessTokenEnc: cipher.encrypt("access-token"),
      listings: externalIds.map((externalId) => ({ externalId, priceCents: 4990 })),
    },
    attemptsMade: 0,
    maxAttempts: 8,
  };
}

function connectorsWith(updateStockPrice: (update: StockPriceUpdate) => Promise<void>) {
  const connector = {
    updateStockPrice: async (_credentials: unknown, update: StockPriceUpdate) =>
      updateStockPrice(update),
  };
  return { mock: connector, mercado_livre: connector, shopee: connector, tiktok_shop: connector };
}

describe("deleted store pause", () => {
  it("sends zero stock for every listing with the store's own token", async () => {
    const calls: Array<{ token: string; update: StockPriceUpdate }> = [];
    const connector = {
      updateStockPrice: async (credentials: { accessToken: string }, update: StockPriceUpdate) => {
        calls.push({ token: credentials.accessToken, update });
      },
    };
    const process = createDeletedStorePauseProcessor({
      cipher,
      connectors: {
        mock: connector,
        mercado_livre: connector,
        shopee: connector,
        tiktok_shop: connector,
      },
    });

    await process(jobFor(["MLB1", "MLB2"]));

    expect(calls).toEqual([
      { token: "access-token", update: { externalId: "MLB1", priceCents: 4990, stock: 0 } },
      { token: "access-token", update: { externalId: "MLB2", priceCents: 4990, stock: 0 } },
    ]);
  });

  // Regression: a deleted account's listing that is still live is tried again.
  it("fails the attempt while a listing is still live, so it is tried again", async () => {
    const process = createDeletedStorePauseProcessor({
      cipher,
      connectors: connectorsWith(async (update) => {
        if (update.externalId === "MLB2") {
          throw new Error("timeout");
        }
      }),
    });

    const attempt = process(jobFor(["MLB1", "MLB2"]));

    await expect(attempt).rejects.toThrow("MLB2");
    await expect(attempt).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it("counts a listing the marketplace already ended as paused", async () => {
    const process = createDeletedStorePauseProcessor({
      cipher,
      connectors: connectorsWith(async () => {
        throw marketplaceListingEndedError("ended", { status: 404 });
      }),
    });

    await expect(process(jobFor(["MLB1"]))).resolves.toBeUndefined();
  });

  it("stops retrying when no failure can pass later, such as a revoked token", async () => {
    const process = createDeletedStorePauseProcessor({
      cipher,
      connectors: connectorsWith(async () => {
        throw marketplaceAuthError();
      }),
    });

    await expect(process(jobFor(["MLB1"]))).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("names at most 20 listings in the error and counts the rest", async () => {
    const ids = Array.from({ length: 23 }, (_, index) => `MLB${index}`);
    const process = createDeletedStorePauseProcessor({
      cipher,
      connectors: connectorsWith(async () => {
        throw new Error("timeout");
      }),
    });

    await expect(process(jobFor(ids))).rejects.toThrow(
      "23 listing(s) of mercado_livre shop shop-1 still live: MLB0",
    );
    await expect(process(jobFor(ids))).rejects.toThrow("and 3 more");
  });
});
