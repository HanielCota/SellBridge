import type { FulfillmentStatus } from "@sellbridge/shared/schemas";

/** Carrier and tracking as typed in the dispatch fields. */
export interface DispatchFields {
  carrier: string;
  trackingCode: string;
  trackingUrl: string;
}

const NO_DISPATCH_FIELDS: DispatchFields = { carrier: "", trackingCode: "", trackingUrl: "" };

/**
 * What an update sends of carrier and tracking. Only the dispatch itself carries them: the form
 * hides those fields once the parcel left, and the server keeps what it stored when they come
 * blank. Resending the stored values would refuse every later step of a parcel whose code was
 * saved before a rule existed, through a field the person can no longer see.
 */
export function dispatchFieldsFor(
  current: FulfillmentStatus,
  next: FulfillmentStatus,
  typed: DispatchFields,
): DispatchFields {
  if (next === "shipped" && current !== "shipped") {
    return typed;
  }
  return NO_DISPATCH_FIELDS;
}
