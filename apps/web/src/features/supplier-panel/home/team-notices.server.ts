import { listActiveSupplierFlags } from "@sellbridge/database/repositories";
import type { SupplierFlagReason } from "@sellbridge/shared/supplier-flags";
import { database } from "@/lib/server/database";

/** One "Aviso da equipe" as the supplier reads it: no author, no revoke note. */
export interface TeamNotice {
  id: string;
  reason: SupplierFlagReason;
  note: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Picks the supplier's fields one by one, so a column added to the query later never reaches the
 * supplier by accident (who applied a flag stays with the team).
 */
function toTeamNotice(flag: TeamNotice): TeamNotice {
  return {
    id: flag.id,
    reason: flag.reason,
    note: flag.note,
    createdAt: flag.createdAt,
    expiresAt: flag.expiresAt,
  };
}

/** The supplier's own active flags, most recent first, for the home's "Avisos da equipe". */
export async function loadTeamNotices(supplierId: string): Promise<TeamNotice[]> {
  const flags = await listActiveSupplierFlags(database, supplierId, new Date());
  return flags.map(toTeamNotice);
}
