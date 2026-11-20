import {
  resellerBlingSettingsSchema,
  type ResellerBlingSettings,
} from "@sellbridge/shared/reseller-bling";
import { and, asc, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { erpOAuthStates, resellerErpConnections } from "../schema/index.ts";
import type { ErpProvider, ErpTokens } from "./erp-connections.ts";

type ResellerErpConnectionRow = typeof resellerErpConnections.$inferSelect;

/** The reseller's ERP account with its sale note settings read and checked. */
export interface ResellerErpConnection extends Omit<ResellerErpConnectionRow, "saleNoteSettings"> {
  /** Null until the reseller saves them, or when the saved ones no longer pass the schema. */
  readonly saleNoteSettings: ResellerBlingSettings | null;
}

function readSettings(value: unknown): ResellerBlingSettings | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = resellerBlingSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function withSettings(row: ResellerErpConnectionRow): ResellerErpConnection {
  return { ...row, saleNoteSettings: readSettings(row.saleNoteSettings) };
}

/** A one-time state for the ERP consent page of a reseller: who asked, for which account. */
export async function createResellerErpOAuthState(
  database: Database,
  input: {
    state: string;
    tenantId: string;
    userId: string;
    provider: ErpProvider;
    ttlMilliseconds: number;
  },
): Promise<void> {
  // Abandoned consents are never consumed: each new one clears the expired ones.
  await database.delete(erpOAuthStates).where(lt(erpOAuthStates.expiresAt, new Date()));
  await database.insert(erpOAuthStates).values({
    state: input.state,
    tenantId: input.tenantId,
    userId: input.userId,
    provider: input.provider,
    expiresAt: new Date(Date.now() + input.ttlMilliseconds),
  });
}

/**
 * Saves the reseller's ERP account as connected; reconnecting replaces the tokens. The settings
 * name ids of the account (operation, payment methods) and the reseller may have connected
 * another one, so they are cleared and issuing waits until the reseller saves them again.
 */
export async function upsertResellerErpConnection(
  database: Database,
  input: {
    tenantId: string;
    provider: ErpProvider;
    userId: string | null;
    tokens: ErpTokens;
    accountName?: string | null;
  },
): Promise<ResellerErpConnection> {
  const values = {
    ...input.tokens,
    accountName: input.accountName ?? null,
    status: "connected" as const,
    lastError: null,
    connectedByUserId: input.userId,
    connectedAt: new Date(),
    saleNotesEnabledAt: null,
    saleNoteSettings: null,
  };
  const [row] = await database
    .insert(resellerErpConnections)
    .values({ tenantId: input.tenantId, provider: input.provider, ...values })
    .onConflictDoUpdate({
      target: [resellerErpConnections.tenantId, resellerErpConnections.provider],
      set: values,
    })
    .returning();
  if (row === undefined) {
    throw new Error(`ERP connection not saved for reseller ${input.tenantId}`);
  }
  return withSettings(row);
}

export async function findResellerErpConnection(
  database: Database,
  input: { tenantId: string; provider: ErpProvider },
): Promise<ResellerErpConnection | null> {
  const [row] = await database
    .select()
    .from(resellerErpConnections)
    .where(
      and(
        eq(resellerErpConnections.tenantId, input.tenantId),
        eq(resellerErpConnections.provider, input.provider),
      ),
    );
  return row === undefined ? null : withSettings(row);
}

/**
 * Saves the note's settings and whether the ERP issues the reseller's sale notes. Turning it on
 * keeps the first moment it was on: parcels from before it keep waiting for the reseller's note.
 * Returns false when the account is not connected.
 */
export async function saveResellerSaleNoteSettings(
  database: Database,
  input: {
    tenantId: string;
    provider: ErpProvider;
    settings: ResellerBlingSettings;
    issueFromErp: boolean;
    now: Date;
  },
): Promise<boolean> {
  const enabledAt = input.issueFromErp
    ? sql`coalesce(${resellerErpConnections.saleNotesEnabledAt}, ${input.now.toISOString()}::timestamptz)`
    : null;
  const updated = await database
    .update(resellerErpConnections)
    .set({ saleNoteSettings: input.settings, saleNotesEnabledAt: enabledAt })
    .where(
      and(
        eq(resellerErpConnections.tenantId, input.tenantId),
        eq(resellerErpConnections.provider, input.provider),
        eq(resellerErpConnections.status, "connected"),
      ),
    )
    .returning({ id: resellerErpConnections.id });
  return updated.length > 0;
}

/** Disconnects the reseller's ERP account; its parcels go back to waiting for the reseller. */
export async function deleteResellerErpConnection(
  database: Database,
  input: { tenantId: string; provider: ErpProvider },
): Promise<void> {
  await database
    .delete(resellerErpConnections)
    .where(
      and(
        eq(resellerErpConnections.tenantId, input.tenantId),
        eq(resellerErpConnections.provider, input.provider),
      ),
    );
}

/**
 * Swaps the tokens only while the connection is connected and still holds the refresh token the
 * caller used: a reconnection or a parallel refresh in between wins, and this one is dropped.
 */
export async function rotateResellerErpTokens(
  database: Database,
  input: { connectionId: string; previousRefreshTokenEnc: string; tokens: ErpTokens },
): Promise<boolean> {
  const updated = await database
    .update(resellerErpConnections)
    .set({ ...input.tokens, lastError: null })
    .where(
      and(
        eq(resellerErpConnections.id, input.connectionId),
        eq(resellerErpConnections.status, "connected"),
        eq(resellerErpConnections.refreshTokenEnc, input.previousRefreshTokenEnc),
      ),
    )
    .returning({ id: resellerErpConnections.id });
  return updated.length > 0;
}

/**
 * Marks the connection expired (the ERP refused the refresh token) or records a passing error,
 * again only while the failed refresh token is still the saved one.
 */
export async function recordResellerErpRefreshFailure(
  database: Database,
  input: { connectionId: string; refreshTokenEnc: string; lastError: string; expired: boolean },
): Promise<boolean> {
  const updated = await database
    .update(resellerErpConnections)
    .set(
      input.expired
        ? { status: "expired", lastError: input.lastError }
        : { lastError: input.lastError },
    )
    .where(
      and(
        eq(resellerErpConnections.id, input.connectionId),
        eq(resellerErpConnections.status, "connected"),
        eq(resellerErpConnections.refreshTokenEnc, input.refreshTokenEnc),
      ),
    )
    .returning({ id: resellerErpConnections.id });
  return updated.length > 0;
}

/** Connected reseller ERP accounts whose access token expires before `threshold`, soonest first. */
export async function findResellerErpConnectionsExpiringBefore(
  database: Database,
  threshold: Date,
  limit = 500,
): Promise<ResellerErpConnection[]> {
  const rows = await database
    .select()
    .from(resellerErpConnections)
    .where(
      and(
        eq(resellerErpConnections.status, "connected"),
        isNotNull(resellerErpConnections.refreshTokenEnc),
        lt(resellerErpConnections.expiresAt, threshold),
      ),
    )
    .orderBy(asc(resellerErpConnections.expiresAt))
    .limit(limit);
  return rows.map(withSettings);
}
