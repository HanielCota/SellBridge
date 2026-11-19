/**
 * Whether a reseller's marketplace account buys at its supplier's address. Resellers put the
 * supplier's address on their account for pickup and returns; a personal purchase made with the
 * same account then goes to the supplier, who has to turn the courier away. Addresses are compared
 * here and dropped: only the verdict is stored (see docs/marketplaces/mercado-livre.md).
 */

/** What the last check found, stored per store. Append, never rename. */
export const BUYER_ADDRESS_RESULTS = [
  /** The purchase address is none of the store's suppliers' nor its shipping address. */
  "ok",
  /** The purchase address is a supplier's: new publications wait until the reseller fixes it. */
  "supplier_address",
  /** The purchase address is the one the account ships from, matching no known supplier: a warning. */
  "shipping_address",
  /** The account has no address marked for purchases. */
  "no_buying_address",
  /** The marketplace could not be read and there was no earlier verdict to keep. */
  "not_checked",
] as const;
export type BuyerAddressResult = (typeof BUYER_ADDRESS_RESULTS)[number];

/** The address roles a marketplace account marks; one address may have several or none. */
export type AccountAddressType = "buying" | "selling" | "shipping" | "billing";

/** One address of the reseller's account, reduced to what the comparison needs. */
export interface AccountAddress {
  readonly zipCode: string | null;
  readonly street: string | null;
  readonly number: string | null;
  readonly types: readonly AccountAddressType[];
}

/** Where one of the store's suppliers ships from. */
export interface SupplierPlace {
  readonly supplierId: string;
  readonly zipCode: string;
  readonly street: string;
  readonly number: string;
}

export type BuyerAddressVerdict =
  | { readonly result: "supplier_address"; readonly supplierId: string }
  | { readonly result: "ok" | "shipping_address" | "no_buying_address" };

/** Only this verdict holds new publications back; the others are warnings at most. */
export function blocksPublishing(result: BuyerAddressResult | null): boolean {
  return result === "supplier_address";
}

interface Place {
  readonly zipCode: string;
  readonly number: string;
  readonly streetWords: readonly string[];
}

const CEP_LENGTH = 8;

/** Words that only say what kind of street it is, or join its name: "Av. das Flores" = "Flores". */
const STREET_FILLER_WORDS = new Set([
  "rua",
  "r",
  "avenida",
  "av",
  "ave",
  "travessa",
  "tv",
  "trav",
  "alameda",
  "al",
  "estrada",
  "est",
  "rodovia",
  "rod",
  "praca",
  "pca",
  "pc",
  "largo",
  "lgo",
  "viela",
  "beco",
  "via",
  "de",
  "da",
  "do",
  "das",
  "dos",
]);

const WITHOUT_NUMBER = "sn";

function plainText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** A street named only by filler ("Rua R") keeps its words, or it would match every street. */
function streetWordsOf(street: string): string[] {
  const words = plainText(street)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
  const named = words.filter((word) => !STREET_FILLER_WORDS.has(word));
  return named.length === 0 ? words : named;
}

/** "Nº 120", "120" and "120 " are one number; "s/n", "S/N" and "sem número" are "no number". */
function normalizedNumber(number: string): string {
  const compact = plainText(number).replace(/[^a-z0-9]/g, "");
  if (compact === "sn" || compact === "semnumero") {
    return WITHOUT_NUMBER;
  }
  return compact.replace(/^(n|no|num|numero)(?=\d)/, "");
}

function placeOf(zipCode: string | null, street: string | null, number: string | null) {
  if (zipCode === null || street === null || number === null) {
    return null;
  }
  const digits = zipCode.replace(/\D/g, "");
  const streetWords = streetWordsOf(street);
  const normalized = normalizedNumber(number);
  if (digits.length !== CEP_LENGTH || streetWords.length === 0 || normalized === "") {
    return null;
  }
  return { zipCode: digits, number: normalized, streetWords };
}

/**
 * The same street, written the way each side typed it: every word of the shorter name is in the
 * longer one ("Flores" and "Jardim das Flores"). A CEP can cover a whole small town, so the street
 * still has to agree.
 */
function sameStreet(left: readonly string[], right: readonly string[]): boolean {
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const longerWords = new Set(longer);
  return shorter.every((word) => longerWords.has(word));
}

/**
 * The complement is left out on purpose: "sala 2" and "casa" at the same number are one door to a
 * courier. An address without a number ("s/n") only matches another without one.
 */
function samePlace(left: Place, right: Place): boolean {
  return (
    left.zipCode === right.zipCode &&
    left.number === right.number &&
    sameStreet(left.streetWords, right.streetWords)
  );
}

function placeOfAddress(address: AccountAddress): Place | null {
  return placeOf(address.zipCode, address.street, address.number);
}

function shipsFrom(address: AccountAddress): boolean {
  return address.types.includes("shipping") || address.types.includes("selling");
}

function matchedSupplier(
  buying: readonly Place[],
  suppliers: readonly SupplierPlace[],
): string | null {
  for (const supplier of suppliers) {
    const place = placeOf(supplier.zipCode, supplier.street, supplier.number);
    if (place !== null && buying.some((address) => samePlace(address, place))) {
      return supplier.supplierId;
    }
  }
  return null;
}

/**
 * The purchase address is also the one the account ships from: in SellBridge that is the
 * supplier's, even when the supplier has no address on file to compare.
 */
function buysWhereItShips(addresses: readonly AccountAddress[], buying: readonly Place[]): boolean {
  return addresses.some((address) => {
    if (!shipsFrom(address)) {
      return false;
    }
    if (address.types.includes("buying")) {
      return true;
    }
    const place = placeOfAddress(address);
    return place !== null && buying.some((buyingPlace) => samePlace(buyingPlace, place));
  });
}

/**
 * Compares the account's purchase addresses with the store's suppliers and with the address it
 * ships from. The suppliers are checked first: a known supplier blocks new publications, the
 * shipping address only warns.
 */
export function judgeBuyerAddress(
  addresses: readonly AccountAddress[],
  suppliers: readonly SupplierPlace[],
): BuyerAddressVerdict {
  const buyingAddresses = addresses.filter((address) => address.types.includes("buying"));
  if (buyingAddresses.length === 0) {
    return { result: "no_buying_address" };
  }
  const buying = buyingAddresses.flatMap((address) => {
    const place = placeOfAddress(address);
    return place === null ? [] : [place];
  });
  const supplierId = matchedSupplier(buying, suppliers);
  if (supplierId !== null) {
    return { result: "supplier_address", supplierId };
  }
  if (buysWhereItShips(addresses, buying)) {
    return { result: "shipping_address" };
  }
  return { result: "ok" };
}
