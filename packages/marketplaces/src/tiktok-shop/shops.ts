import { marketplaceAuthError } from "../errors.ts";
import type { StoreCredentials } from "../types.ts";
import { requestShop, type TikTokShopContext } from "./client.ts";
import { type AuthorizedShop, authorizedShopsSchema } from "./schemas.ts";

/** The cipher of a shop rarely changes; it is read again after this long. */
const CIPHER_TTL_MILLISECONDS = 60 * 60_000;
/** Bounds the in-memory cache: one entry per connected TikTok shop the process has served. */
const MAX_CACHED_CIPHERS = 1000;
/** Brazilian shops are preferred when one authorization covers several markets. */
const HOME_REGION = "BR";

export async function listAuthorizedShops(
  context: TikTokShopContext,
  accessToken: string,
): Promise<AuthorizedShop[]> {
  const result = await requestShop(context, {
    schema: authorizedShopsSchema,
    method: "GET",
    path: "/authorization/202309/shops",
    accessToken,
  });
  return result.shops;
}

/** The shop a new authorization connects: the Brazilian one, else the first listed. */
export function chooseConnectedShop(shops: readonly AuthorizedShop[]): AuthorizedShop | null {
  return shops.find((shop) => shop.region === HOME_REGION) ?? shops[0] ?? null;
}

function rememberCipher(context: TikTokShopContext, shopId: string, cipher: string): void {
  context.shopCiphers.delete(shopId);
  if (context.shopCiphers.size >= MAX_CACHED_CIPHERS) {
    const oldest = context.shopCiphers.keys().next().value;
    if (oldest !== undefined) {
      context.shopCiphers.delete(oldest);
    }
  }
  context.shopCiphers.set(shopId, { cipher, readAt: context.now().getTime() });
}

/**
 * The `shop_cipher` of a connected shop, which every shop-level endpoint asks for. Read from Get
 * Authorized Shops instead of being stored, so connecting needed no new column. A shop missing
 * from the list was de-authorized: the store must reconnect.
 */
export async function shopCipher(
  context: TikTokShopContext,
  store: StoreCredentials,
): Promise<string> {
  const cached = context.shopCiphers.get(store.externalShopId);
  if (cached !== undefined && context.now().getTime() - cached.readAt < CIPHER_TTL_MILLISECONDS) {
    return cached.cipher;
  }
  const shops = await listAuthorizedShops(context, store.accessToken);
  const shop = shops.find((candidate) => candidate.id === store.externalShopId);
  if (shop === undefined) {
    context.shopCiphers.delete(store.externalShopId);
    throw marketplaceAuthError(
      "A loja do TikTok Shop não está mais autorizada para o SellBridge. Conecte a loja de novo.",
    );
  }
  rememberCipher(context, shop.id, shop.cipher);
  return shop.cipher;
}
