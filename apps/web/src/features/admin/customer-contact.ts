import type { BillingHolder } from "@sellbridge/database/repositories";
import type { BillingAddress } from "@sellbridge/shared/billing-address";
import type { StaffRole } from "@sellbridge/shared/staff-access";

/** The customer's billing address and phone, as a member of the team may see them. */
export interface StaffCustomerContact {
  /** Null while the customer has not filled it in. */
  address: BillingAddress | null;
  /** Only for admins; null for any other role, or when the customer has no phone saved. */
  phone: string | null;
}

export const NO_CUSTOMER_CONTACT: StaffCustomerContact = { address: null, phone: null };

/**
 * Every staff role sees the billing address (behind the eye on screen); only an admin gets the
 * phone. The phone is cut here, before serializing, so no other role, supplier or reseller can
 * use it to deal outside the platform.
 */
export function customerContactForStaff(
  role: StaffRole,
  holder: BillingHolder | null,
): StaffCustomerContact {
  if (holder === null) {
    return NO_CUSTOMER_CONTACT;
  }
  if (role !== "admin") {
    return { address: holder.address, phone: null };
  }
  return { address: holder.address, phone: holder.phone };
}
