import { parseJsonText } from "@sellbridge/shared/http-body";
import { logger } from "@sellbridge/shared/logger";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { type MarketplaceShippingAddress, shippingAddressReading } from "./shipping-address.ts";

/**
 * The buyer's address is personal data: it is stored encrypted (`orders.shipping_address_enc`,
 * same key as the store tokens) and only opened for the reseller's forward form. Never logged.
 */
export function sealShippingAddress(
  cipher: TokenCipher,
  address: MarketplaceShippingAddress,
): string {
  return cipher.encrypt(JSON.stringify(address));
}

/** The stored address, or null when there is none or it no longer opens (a rotated key). */
export function openShippingAddress(
  cipher: TokenCipher,
  sealed: string | null,
): MarketplaceShippingAddress | null {
  if (sealed === null) {
    return null;
  }
  const plaintext = decryptOrNull(cipher, sealed);
  if (plaintext === null) {
    return null;
  }
  const reading = shippingAddressReading(parseJsonText(plaintext));
  if (reading.kind === "unavailable") {
    logger.warn("order.shipping_address_unreadable", { reason: reading.reason });
    return null;
  }
  return reading.address;
}

function decryptOrNull(cipher: TokenCipher, sealed: string): string | null {
  try {
    return cipher.decrypt(sealed);
  } catch (error) {
    // Decryption fails before any plaintext exists, so the error carries no address.
    logger.warn("order.shipping_address_decrypt_failed", { error });
    return null;
  }
}
