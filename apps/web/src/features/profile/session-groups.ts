import type { ActiveSession } from "./account.queries";
import { type DeviceDescription, describeUserAgent } from "./user-agent";

export interface SessionGroup {
  key: string;
  device: DeviceDescription;
  ipAddress: string | null;
  isCurrent: boolean;
  /** Most recent activity among the group's sessions. */
  lastActiveAt: Date;
  tokens: string[];
}

/**
 * Collapses sessions that look the same to a person (browser, system and IP) into one row,
 * so dozens of logins from the same computer read as one device. The current session always
 * stays on its own row. Expects sessions sorted current first, then most recent first.
 */
export function groupSessions(sessions: readonly ActiveSession[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();
  for (const session of sessions) {
    const device = describeUserAgent(session.userAgent);
    const key = session.isCurrent
      ? "current"
      : [device.browser, device.os, session.ipAddress ?? ""].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.tokens.push(session.token);
      continue;
    }
    groups.set(key, {
      key,
      device,
      ipAddress: session.ipAddress,
      isCurrent: session.isCurrent,
      lastActiveAt: session.updatedAt,
      tokens: [session.token],
    });
  }
  return [...groups.values()];
}
