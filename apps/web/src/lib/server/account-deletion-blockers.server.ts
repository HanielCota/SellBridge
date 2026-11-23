import { findDeletionBlockers } from "@sellbridge/database/repositories";
import { conflictError } from "@sellbridge/shared/errors";
import {
  type DeletionBlockerLine,
  describeDeletionBlockers,
} from "@/features/profile/deletion-blockers";
import { database } from "@/lib/server/database";
import { listMemberships } from "@/lib/server/membership";

/**
 * What still keeps the workspaces that go with the account from being deleted: orders and
 * parcels on their way, payments in progress, money held and returns in review.
 */
export async function listDeletionBlockers(input: {
  userId: string;
  tenantIds: readonly string[];
  now: Date;
}): Promise<DeletionBlockerLine[]> {
  if (input.tenantIds.length === 0) {
    return [];
  }
  const memberships = await listMemberships(input.userId);
  const profiles = memberships.filter((membership) =>
    input.tenantIds.includes(membership.organizationId),
  );
  const perProfile = await Promise.all(
    profiles.map(async (profile) => {
      const blockers = await findDeletionBlockers(database, {
        tenantIds: [profile.organizationId],
        now: input.now,
      });
      return describeDeletionBlockers(blockers, { profile, now: input.now });
    }),
  );
  return perProfile.flat();
}

/**
 * Refuses the deletion while anything is left to resolve, before any data or subscription is
 * touched: the same rule the marketplaces and Asaas apply to closing an account.
 *
 * @throws {AppError} CONFLICT listing what is left, in the words the screen shows.
 */
export async function assertNothingLeftToResolve(input: {
  userId: string;
  tenantIds: readonly string[];
}): Promise<void> {
  const lines = await listDeletionBlockers({ ...input, now: new Date() });
  if (lines.length === 0) {
    return;
  }
  const items = lines.map((line) => line.text).join("; ");
  throw conflictError(`Antes de excluir a conta, resolva: ${items}.`);
}
