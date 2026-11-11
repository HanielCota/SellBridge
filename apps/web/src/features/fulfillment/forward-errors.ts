import type { DeliveryAddress } from "@sellbridge/shared/schemas";

export type ForwardField = keyof DeliveryAddress | "notes";

export type ForwardErrors = Partial<Record<ForwardField, string>>;

const FORWARD_FIELDS: readonly ForwardField[] = [
  "recipient",
  "postalCode",
  "street",
  "number",
  "complement",
  "neighborhood",
  "city",
  "state",
  "notes",
];

function fieldOf(path: readonly PropertyKey[]): ForwardField | null {
  const key = path[0] === "address" ? path[1] : path[0];
  return FORWARD_FIELDS.find((field) => field === key) ?? null;
}

/**
 * The schema's issues as one message per field, so each shows under its own field instead of
 * one toast that names only the first problem.
 */
export function forwardErrorsByField(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): ForwardErrors {
  const errors: ForwardErrors = {};
  for (const issue of issues) {
    const field = fieldOf(issue.path);
    if (field !== null && errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/** The first field with a problem, in the order the form shows them; null when there is none. */
export function firstForwardErrorField(errors: ForwardErrors): ForwardField | null {
  return FORWARD_FIELDS.find((field) => errors[field] !== undefined) ?? null;
}

/** `errors` without the messages of `fields`, for the fields the reseller just changed. */
export function clearForwardErrors(
  errors: ForwardErrors,
  fields: readonly ForwardField[],
): ForwardErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([field]) => fields.every((cleared) => cleared !== field)),
  );
}
