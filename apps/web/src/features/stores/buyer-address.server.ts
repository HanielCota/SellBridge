import {
  checkStoreBuyerAddress,
  findBuyerAddressCheckTarget,
} from "@sellbridge/database/repositories";
import { readMercadoLivreAccountAddresses, type StoreCredentials } from "@sellbridge/marketplaces";
import type { BuyerAddressResult } from "@sellbridge/shared/buyer-address";
import { withDeadline } from "@sellbridge/shared/deadline";
import { notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { mercadoLivreApiConfig, tokenCipher } from "@/lib/server/marketplaces";

/**
 * How long the connection waits for the check before showing the store; past it, the check still
 * finishes and the stores page shows its verdict on the next load.
 */
const CONNECT_CHECK_DEADLINE_MILLISECONDS = 5000;

async function checkWithCredentials(
  storeConnectionId: string,
  credentials: StoreCredentials,
): Promise<BuyerAddressResult> {
  return checkStoreBuyerAddress(database, {
    storeConnectionId,
    readAddresses: async () => readMercadoLivreAccountAddresses(mercadoLivreApiConfig, credentials),
    now: new Date(),
  });
}

/**
 * Checks a Mercado Livre store right after it was connected. The store is connected either way:
 * a slow or failed check never stops the connection, the daily check tries again.
 */
export async function checkBuyerAddressAfterConnect(
  store: { id: string; marketplace: string },
  credentials: StoreCredentials,
): Promise<void> {
  if (store.marketplace !== "mercado_livre") {
    return;
  }
  try {
    await withDeadline(
      checkWithCredentials(store.id, credentials),
      CONNECT_CHECK_DEADLINE_MILLISECONDS,
      "Conferência do endereço de compra",
    );
  } catch (error) {
    logger.warn("store.buyer_address_connect_check_failed", { storeConnectionId: store.id, error });
  }
}

/**
 * "Já arrumei, conferir de novo": reads the account again now and returns the new verdict.
 *
 * @throws {AppError} NOT_FOUND when the store is not a connected Mercado Livre store of the tenant.
 */
export async function recheckBuyerAddressForTenant(
  tenantId: string,
  storeConnectionId: string,
): Promise<BuyerAddressResult> {
  const store = await findBuyerAddressCheckTarget(database, tenantId, storeConnectionId);
  if (store === null) {
    throw notFoundError("Loja do Mercado Livre não encontrada ou desconectada");
  }
  return checkWithCredentials(store.id, {
    externalShopId: store.externalShopId,
    accessToken: tokenCipher.decrypt(store.accessTokenEnc),
  });
}
