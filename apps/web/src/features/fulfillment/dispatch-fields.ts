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

/** What is missing in each dispatch field, said next to it with how to fill it; null when fine. */
export interface DispatchFieldErrors {
  carrier: string | null;
  trackingCode: string | null;
}

/**
 * The fields the dispatch still needs, checked before sending so the warning shows next to the
 * field instead of in a passing toast.
 */
export function dispatchFieldErrors(typed: DispatchFields): DispatchFieldErrors {
  return {
    carrier:
      typed.carrier.trim() === ""
        ? "Escreva a transportadora. Exemplo: Correios ou Mercado Envios."
        : null,
    trackingCode:
      typed.trackingCode.trim() === ""
        ? "Escreva o código de rastreio que está na etiqueta. Exemplo: AA123456789BR."
        : null,
  };
}
