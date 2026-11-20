/** The Asaas reference of an upgrade difference charge. */
export const UPGRADE_REFERENCE = "upgrade:";

/**
 * Names the charge after the tenant and the end of the paid month the difference was worked out
 * for (Unix milliseconds), so a payment made after that day is recognized as late.
 */
export function upgradeReference(tenantId: string, reference: string, until: Date): string {
  return `${UPGRADE_REFERENCE}${tenantId}:${reference}:${until.getTime()}`;
}

/** The end of the paid month an upgrade difference covers, or null for a reference without it. */
export function upgradeUntil(externalReference: string | null | undefined): Date | null {
  if (externalReference?.startsWith(UPGRADE_REFERENCE) !== true) return null;
  const last = externalReference.split(":").at(-1) ?? "";
  const until = /^\d{13}$/.test(last) ? new Date(Number(last)) : null;
  if (until === null || Number.isNaN(until.getTime())) return null;
  return until;
}
