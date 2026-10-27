import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import type { SupplierFlagStatus } from "@sellbridge/shared/supplier-flags";

// Brazil time: a flag applied at 23:30 must not show the next day's date.
const flagDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: REPORT_TIME_ZONE,
});

/** "12/10/2026". */
export function formatFlagDate(date: Date): string {
  return flagDate.format(date);
}

function byWhom(name: string | null): string {
  if (name === null) {
    return "";
  }
  return ` por ${name}`;
}

interface TeamFlagDates {
  createdAt: Date;
  expiresAt: Date;
  createdByName: string | null;
  revokedAt: Date | null;
  revokedByName: string | null;
  status: SupplierFlagStatus;
}

/** The team's line under a flag: when, by whom, and until when it counts (or why it stopped). */
export function teamFlagDatesLine(flag: TeamFlagDates): string {
  const applied = `Aplicada em ${formatFlagDate(flag.createdAt)}${byWhom(flag.createdByName)}`;
  if (flag.status === "revoked" && flag.revokedAt !== null) {
    return `${applied} · retirada em ${formatFlagDate(flag.revokedAt)}${byWhom(flag.revokedByName)}`;
  }
  if (flag.status === "expired") {
    return `${applied} · venceu em ${formatFlagDate(flag.expiresAt)}`;
  }
  return `${applied} · vale até ${formatFlagDate(flag.expiresAt)}`;
}

/** The supplier's line: no names, only the dates. */
export function supplierNoticeDatesLine(notice: { createdAt: Date; expiresAt: Date }): string {
  return `Recebido em ${formatFlagDate(notice.createdAt)} · vale até ${formatFlagDate(notice.expiresAt)}`;
}
