/**
 * Whether the supplier may add products: not after the team switched it off, nor after its
 * sign-up was refused (an MEI, say), since those products would never reach a reseller.
 */
export function canAddProducts(supplier: {
  active: boolean;
  approvalStatus: string | null;
}): boolean {
  return supplier.active && supplier.approvalStatus !== "refused";
}
