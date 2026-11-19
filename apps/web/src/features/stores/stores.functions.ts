import {
  EMPTY_STORE_ACTIVITY,
  getStoreActivity,
  listBuyerAddressChecks,
  listStoreConnections,
} from "@sellbridge/database/repositories";
import { MARKETPLACE_LABELS, type MarketplaceId } from "@sellbridge/marketplaces";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { findNewStoreBlock } from "@/features/billing/billing.server";
import { database } from "@/lib/server/database";
import { connectors } from "@/lib/server/marketplaces";
import { tenantMiddleware } from "@/lib/server/middleware";
import { recheckBuyerAddressForTenant } from "./buyer-address.server";
import { disconnectStoreForTenant } from "./disconnect-store.server";

export interface MarketplaceOption {
  id: MarketplaceId;
  label: string;
  available: boolean;
}

const MARKETPLACE_ORDER: MarketplaceId[] = ["mercado_livre", "shopee", "tiktok_shop"];

export const listStores = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => {
    const [connections, buyerAddresses, newStoreBlock] = await Promise.all([
      listStoreConnections(database, context.tenantId),
      listBuyerAddressChecks(database, context.tenantId),
      findNewStoreBlock(context.tenantId),
    ]);
    const activity = await getStoreActivity(
      database,
      context.tenantId,
      connections.map((store) => store.id),
    );
    const stores = connections.map((store) => ({
      ...store,
      activity: activity.get(store.id) ?? EMPTY_STORE_ACTIVITY,
      buyerAddress: buyerAddresses.get(store.id) ?? null,
    }));
    const marketplaces: MarketplaceOption[] = MARKETPLACE_ORDER.map((id) => ({
      id,
      label: MARKETPLACE_LABELS[id],
      available: connectors[id].isConfigured(),
    }));
    return { stores, marketplaces, newStoreBlock };
  });

/** "Já arrumei, conferir de novo": reads the store account's purchase address again now. */
export const recheckBuyerAddressFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(z.object({ storeConnectionId: z.uuid() }))
  .handler(async ({ context, data }) => ({
    result: await recheckBuyerAddressForTenant(context.tenantId, data.storeConnectionId),
  }));

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
