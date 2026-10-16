import type { Database } from "../client.ts";
import type { storeConnections } from "../schema/index.ts";

export interface TargetWithPendingDescription {
  targetId: string;
  externalId: string;
  plainText: string;
  store: typeof storeConnections.$inferSelect;
}

export async function findTargetsWithPendingDescription(
  _database: Database,
  _limit = 50,
): Promise<TargetWithPendingDescription[]> {
  return [];
}

export async function markDescriptionSent(_database: Database, _targetId: string): Promise<void> {}

export async function markDescriptionFailed(
  _database: Database,
  _targetId: string,
  _reason: string,
): Promise<void> {}

export async function requestDescriptionResend(
  _database: Database,
  _tenantId: string,
  _listingIds: readonly string[],
): Promise<number> {
  return 0;
}
