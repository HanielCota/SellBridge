import { queryOptions } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export interface ActiveSession {
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
  isCurrent: boolean;
}

/** Every device signed in to this account, the current one first, then the most recent. */
export const activeSessionsQueryOptions = () =>
  queryOptions({
    queryKey: ["profile", "sessions"],
    queryFn: async (): Promise<ActiveSession[]> => {
      const [sessions, current] = await Promise.all([
        authClient.listSessions(),
        authClient.getSession(),
      ]);
      if (sessions.error) {
        throw new Error("Não foi possível carregar suas sessões.");
      }
      const currentToken = current.data?.session.token;
      return sessions.data
        .map((session) => ({
          token: session.token,
          ipAddress: session.ipAddress ?? null,
          userAgent: session.userAgent ?? null,
          createdAt: new Date(session.createdAt),
          updatedAt: new Date(session.updatedAt),
          isCurrent: session.token === currentToken,
        }))
        .toSorted(
          (left, right) =>
            Number(right.isCurrent) - Number(left.isCurrent) ||
            right.updatedAt.getTime() - left.updatedAt.getTime(),
        );
    },
  });

/** Whether the account can sign in with a password (Google-only accounts cannot). */
export const hasPasswordQueryOptions = () =>
  queryOptions({
    queryKey: ["profile", "has-password"],
    queryFn: async (): Promise<boolean> => {
      const result = await authClient.listAccounts();
      if (result.error) {
        throw new Error("Não foi possível carregar suas formas de acesso.");
      }
      return result.data.some((account) => account.providerId === "credential");
    },
  });
