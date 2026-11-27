import type { ShopeePickupChoice } from "@sellbridge/marketplaces";
import type { BillingAddress } from "@sellbridge/shared/billing-address";

/** The supplier's address, as the pickup rule needs it (`fiscalProfile.address`). */
export type SupplierAddress = Pick<
  BillingAddress,
  "cep" | "street" | "number" | "complement" | "neighborhood" | "city" | "state"
>;

/**
 * Where the carrier picks the parcel up (decision of 2026-11-27): the supplier's address, as one
 * of the pickup addresses of the reseller's Shopee shop. Never the shop's default on its own.
 */
export type SupplierPickup =
  { kind: "match"; choice: ShopeePickupChoice } | { kind: "missing" } | { kind: "ambiguous" };

const NO_NUMBER = /^s\/?n$/i;

function digits(text: string): string {
  return text.replaceAll(/\D/g, "");
}

/** Whether Shopee's address line carries the supplier's street number as one of its numbers. */
function hasStreetNumber(line: string, streetNumber: string): boolean {
  const wanted = digits(streetNumber);
  if (NO_NUMBER.test(streetNumber.trim()) || wanted === "") {
    return true;
  }
  return Array.from(line.matchAll(/\d+/g), (found) => found[0]).includes(wanted);
}

function isPickupAddress(choice: ShopeePickupChoice): boolean {
  return choice.flags.some((flag) => flag.toLowerCase() === "pickup_address");
}

/** The shop's pickup address that is the supplier's: the same CEP and the same street number. */
export function supplierPickup(
  choices: readonly ShopeePickupChoice[],
  supplier: SupplierAddress,
): SupplierPickup {
  const cep = digits(supplier.cep);
  const matches = choices.filter(
    (choice) => digits(choice.zipcode) === cep && hasStreetNumber(choice.address, supplier.number),
  );
  const [only] = matches;
  if (only === undefined) {
    return { kind: "missing" };
  }
  if (matches.length === 1) {
    return { kind: "match", choice: only };
  }
  const flagged = matches.filter(isPickupAddress);
  const [preferred] = flagged;
  return flagged.length === 1 && preferred !== undefined
    ? { kind: "match", choice: preferred }
    : { kind: "ambiguous" };
}

function formattedCep(cep: string): string {
  const value = digits(cep);
  return value.length === 8 ? `${value.slice(0, 5)}-${value.slice(5)}` : cep.trim();
}

/** The supplier's address in lines, as the person reads it and types it into Shopee. */
export function supplierAddressLines(address: SupplierAddress): string[] {
  const complement = address.complement.trim();
  return [
    `${address.street}, ${address.number}${complement === "" ? "" : ` - ${complement}`}`,
    `${address.neighborhood}, ${address.city} - ${address.state}`,
    `CEP ${formattedCep(address.cep)}`,
  ];
}

/** Shopee's pickup address in lines, as the carrier will read it. */
export function pickupAddressLines(choice: ShopeePickupChoice): string[] {
  const place = [choice.district, [choice.city, choice.state].filter(Boolean).join(" - ")]
    .filter((part) => part !== "")
    .join(", ");
  return [choice.address, place, choice.zipcode === "" ? "" : `CEP ${formattedCep(choice.zipcode)}`]
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
