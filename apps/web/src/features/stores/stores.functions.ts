import {
  EMPTY_STORE_ACTIVITY,
  getStoreActivity,
  isStoreNameTaken,
  listStoreConnections,
} from "@sellbridge/database/repositories";
import {
  encodeMockAuthorizationCode,
  MARKETPLACE_LABELS,
  type MarketplaceId,
} from "@sellbridge/marketplaces";
import { conflictError, validationError } from "@sellbridge/shared/errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { database } from "@/lib/server/database";
import { connectors, oauthCallbackUrl } from "@/lib/server/marketplaces";
import { tenantMiddleware } from "@/lib/server/middleware";
import { disconnectStoreForTenant } from "./disconnect-store.server";
import { freeText } from "@sellbridge/shared/schemas";

export interface MarketplaceOption {
  id: MarketplaceId;
  label: string;
  available: boolean;
}

const MARKETPLACE_ORDER: MarketplaceId[] = ["mercado_livre", "shopee", "tiktok_shop", "mock"];

export const listStores = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => {
    const connections = await listStoreConnections(database, context.tenantId);
    const activity = await getStoreActivity(
      database,
      context.tenantId,
      connections.map((store) => store.id),
    );
    const stores = connections.map((store) => ({
      ...store,
      activity: activity.get(store.id) ?? EMPTY_STORE_ACTIVITY,
    }));
    const marketplaces: MarketplaceOption[] = MARKETPLACE_ORDER.map((id) => ({
      id,
      label: MARKETPLACE_LABELS[id],
      available: connectors[id].isConfigured(),
    }));
    return { stores, marketplaces };
  });

export const disconnectStoreFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  // Pausing is the safe default: a live listing without sync can sell stock that is gone.
  .validator(z.object({ storeConnectionId: z.uuid(), pauseListings: z.boolean().default(true) }))
  .handler(async ({ context, data }) =>
    disconnectStoreForTenant({
      tenantId: context.tenantId,
      storeConnectionId: data.storeConnectionId,
      pauseListings: data.pauseListings,
    }),
  );

/**
 * Where the consent screen of the simulated marketplace sends the user back, or null when
 * the simulated store is off (production without `MOCK_WEBHOOK_SECRET`).
 */
export const getMockConsentCallback = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async (): Promise<{ callbackUrl: string | null }> => {
    if (!connectors.mock.isConfigured()) {
      return { callbackUrl: null };
    }
    return { callbackUrl: oauthCallbackUrl("mock") };
  });

/**
 * Consent screen of the simulated marketplace: issues an authorization code for the
 * callback URL. Only our own mock callback is accepted, so it cannot be an open redirect.
 */
export const approveMockAuthorization = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(
    z.object({
      shopName: freeText().trim().min(3, "Informe o nome da loja").max(80),
      state: z.string().min(1),
      redirectUri: z.url(),
    }),
  )
  .handler(async ({ context, data }) => {
    if (!connectors.mock.isConfigured()) {
      throw validationError("A loja simulada não está disponível");
    }
    if (data.redirectUri !== oauthCallbackUrl("mock")) {
      throw validationError("Endereço de retorno não autorizado");
    }
    const shop = { tenantId: context.tenantId, shopName: data.shopName };
    if (await isStoreNameTaken(database, shop)) {
      throw conflictError(
        `O nome "${data.shopName}" não está disponível: você já tem uma loja com ele`,
      );
    }
    const url = new URL(data.redirectUri);
    url.searchParams.set("code", encodeMockAuthorizationCode(data.shopName));
    url.searchParams.set("state", data.state);
    return { redirectTo: url.toString() };
  });
