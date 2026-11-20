/**
 * The reseller's own sale NF-e in venda à ordem (model B): the reseller issues it outside
 * SellBridge, and SellBridge reads it from the marketplace's order or takes the key the reseller
 * types or uploads as XML (on Mercado Livre, which needs the XML). The supplier's notes reference
 * it (decisions of 18/11/2026 and 19/11/2026).
 */

const FIRST_CHECK_IN_MS = 5 * 60_000;
const LONGEST_CHECK_IN_MS = 60 * 60_000;

/**
 * When to read the marketplace again after `checks` reads without the note: 5 minutes, doubling,
 * at most an hour. A reseller issues the note when it suits them, so the reads never give up
 * while the sale goes ahead.
 *
 * @throws {RangeError} When `checks` is not a positive integer.
 */
export function nextResellerInvoiceCheckAt(checks: number, now: Date): Date {
  if (!Number.isInteger(checks) || checks < 1) {
    throw new RangeError(`Reseller invoice checks must be a positive integer, got ${checks}`);
  }
  const delay = Math.min(FIRST_CHECK_IN_MS * 2 ** (checks - 1), LONGEST_CHECK_IN_MS);
  return new Date(now.getTime() + delay);
}

/** The note as the marketplace reports it; the number and series come from the key otherwise. */
export interface MarketplaceSaleInvoice {
  readonly accessKey: string;
  readonly issuedAt: Date | null;
}

/**
 * Where the reseller's note came from: read on the marketplace's order, typed as a key, or its XML
 * uploaded by the reseller (and sent on to the marketplace).
 */
export const RESELLER_INVOICE_SOURCES = ["marketplace", "typed", "uploaded", "bling"] as const;
export type ResellerInvoiceSource = (typeof RESELLER_INVOICE_SOURCES)[number];

/** A venda à ordem parcel of the order whose label is asked for. */
export interface OnBehalfLabelParcel {
  /** Null while the reseller's note is not found. */
  readonly resellerNoteSource: ResellerInvoiceSource | null;
  /** The supplier's remessa, the note in the box, is authorized. */
  readonly remessaAuthorized: boolean;
  /** The SellBridge team let this parcel's label out although a note is stuck. */
  readonly labelReleased: boolean;
}

/** Where to turn when a note cannot come out at all. */
const ASK_SUPPORT = " Se a nota não puder sair, fale com o suporte do SellBridge.";

/**
 * Why the order's label must wait in venda à ordem, or null: the parcel ships with the remessa, and
 * Mercado Livre also needs the reseller's own note on its order (a typed key never reached it).
 * A parcel the team released no longer holds the label (decision of 20/11/2026).
 */
export function onBehalfLabelRefusal(
  parcels: readonly OnBehalfLabelParcel[],
  marketplace: string,
): string | null {
  const held = parcels.filter((parcel) => !parcel.labelReleased);
  if (held.some((parcel) => parcel.resellerNoteSource === null)) {
    return `A etiqueta desta venda à ordem espera a nota de venda do revendedor. Ela sai assim que a nota chegar e a remessa for autorizada.${ASK_SUPPORT}`;
  }
  if (
    marketplace === "mercado_livre" &&
    held.some((parcel) => parcel.resellerNoteSource === "typed")
  ) {
    return `O Mercado Livre ainda não tem a nota de venda do revendedor. O revendedor envia o XML da nota no pedido do SellBridge, e a etiqueta sai em seguida.${ASK_SUPPORT}`;
  }
  if (held.some((parcel) => !parcel.remessaAuthorized)) {
    return `A etiqueta desta venda à ordem espera a nota de remessa do fornecedor, que vai na caixa. Ela sai assim que a remessa for autorizada.${ASK_SUPPORT}`;
  }
  return null;
}
