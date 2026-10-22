import { freeText } from "@sellbridge/shared/schemas";
import { z } from "zod";

/**
 * Where the buyer wants the parcel, as a marketplace delivers it with an order (see
 * docs/marketplaces/order-shipping-address.md). The keys match the forward form's address, so a
 * stored address fills it as is. Lenient on purpose: contact details are not refused here, the
 * forward schema checks them again when the reseller sends the order to the supplier.
 */
export const marketplaceShippingAddressSchema = z.object({
  recipient: freeText().trim().min(1).max(120),
  street: freeText().trim().min(1).max(200),
  number: freeText().trim().min(1).max(30),
  complement: freeText().trim().max(150).default(""),
  /** The district ("bairro"). */
  neighborhood: freeText().trim().max(100).default(""),
  city: freeText().trim().min(1).max(100),
  state: freeText()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a UF com duas letras, como SP"),
  postalCode: freeText()
    .trim()
    .regex(/^\d{5}-?\d{3}$/, "Use o CEP com 8 números, como 01001-000"),
});

export type MarketplaceShippingAddress = z.output<typeof marketplaceShippingAddressSchema>;

/**
 * What a connector answers when asked for an order's shipping address. "unavailable" is a normal
 * answer (the marketplace does not offer it, or not for this order yet), never an error.
 */
export type ShippingAddressReading =
  | { kind: "available"; address: MarketplaceShippingAddress }
  | { kind: "unavailable"; reason: "not_supported" | "not_provided" };

export const SHIPPING_ADDRESS_NOT_SUPPORTED: ShippingAddressReading = {
  kind: "unavailable",
  reason: "not_supported",
};

/** Validates an address a marketplace sent; anything malformed reads as "not provided". */
export function shippingAddressReading(candidate: unknown): ShippingAddressReading {
  if (candidate === null || candidate === undefined) {
    return { kind: "unavailable", reason: "not_provided" };
  }
  const parsed = marketplaceShippingAddressSchema.safeParse(candidate);
  if (!parsed.success) {
    return { kind: "unavailable", reason: "not_provided" };
  }
  return { kind: "available", address: parsed.data };
}
