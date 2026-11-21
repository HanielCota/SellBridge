/**
 * Whether the order still shows the reseller's sale NF-e card: a cancelled parcel no longer asks
 * for a note nobody will issue, but a note already sent stays visible, to be cancelled in the ERP.
 */
export function asksForSaleNote(parcelStatus: string, note: { accessKey: string | null }): boolean {
  return parcelStatus !== "cancelled" || note.accessKey !== null;
}
