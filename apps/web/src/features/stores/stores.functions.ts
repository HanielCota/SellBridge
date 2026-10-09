import { disconnectStore, listStoreConnections } from "@sellbridge/db/repositories";
import {
  encodeMockAuthorizationCode,
  MARKETPLACE_LABELS,
  type MarketplaceId,
} from "@sellbridge/marketplaces";
import { ValidationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { connectors, oauthCallbackUrl } from "@/lib/server/marketplaces";
import { tenantMiddleware } from "@/lib/server/middleware";

export interface MarketplaceOption {
  id: MarketplaceId;
  label: string;
  available: boolean;
}

const MARKETPLACE_ORDER: MarketplaceId[] = ["mercado_livre", "shopee", "tiktok_shop", "mock"];

export const listStores = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => {
    const stores = await listStoreConnections(db, context.tenantId);
    const marketplaces: MarketplaceOption[] = MARKETPLACE_ORDER.map((id) => ({
      id,
      label: MARKETPLACE_LABELS[id],
      available: connectors[id].isConfigured(),
    }));
    return { stores, marketplaces };
  });

export const disconnectStoreFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .inputValidator(z.object({ storeConnectionId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await disconnectStore(db, context.tenantId, data.storeConnectionId);
    logger.info("store.disconnected", {
      tenantId: context.tenantId,
      storeConnectionId: data.storeConnectionId,
    });
    return { ok: true };
  });

/**
 * Consent screen of the simulated marketplace: issues an authorization code for the
 * callback URL. Only our own mock callback is accepted, so it cannot be an open redirect.
 */
export const approveMockAuthorization = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .inputValidator(
    z.object({
      shopName: z.string().trim().min(3, "Informe o nome da loja").max(80),
      state: z.string().min(1),
      redirectUri: z.url(),
    }),
  )
  .handler(async ({ data }) => {
    if (data.redirectUri !== oauthCallbackUrl("mock")) {
      throw new ValidationError("Endereço de retorno não autorizado");
    }
    const url = new URL(data.redirectUri);
    url.searchParams.set("code", encodeMockAuthorizationCode(data.shopName));
    url.searchParams.set("state", data.state);
    return { redirectTo: url.toString() };
  });
