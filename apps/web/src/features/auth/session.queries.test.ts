import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSession } from "./session.functions";
import {
  forgetAppSession,
  invalidateWithFreshSession,
  reuseAppSession,
  SESSION_REUSE_TIME_IN_MS,
} from "./session.queries";

const START = new Date("2026-11-15T12:00:00Z");

function sessionFor(profileSlug: string | null): AppSession {
  return {
    user: {
      id: "user-1",
      name: "Ana",
      email: "ana@example.test",
      role: "user",
      image: null,
      createdAt: START.toISOString(),
    },
    tenantId: profileSlug === null ? null : `tenant-${profileSlug}`,
    profileSlug,
    foreignProfile: null,
    profileKind: "seller",
    profiles: [],
    impersonatedBy: null,
    impersonationEndsAt: null,
    adminMode: false,
    teamOnly: false,
    termsAccepted: true,
    buyerQuestionsEnabled: false,
  };
}

/** Counts the asks to the server and answers each with the given session. */
function fakeServer(answer: (call: number) => AppSession | null) {
  let calls = 0;
  return {
    fetchSession: async () => {
      calls += 1;
      return answer(calls);
    },
    calls: () => calls,
  };
}

const clients: QueryClient[] = [];

function newQueryClient(): QueryClient {
  const client = new QueryClient();
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.clear();
  }
  vi.useRealTimers();
});

describe("reuseAppSession", () => {
  it("asks the server once for clicks within 30 seconds on the same profile", async () => {
    const queryClient = newQueryClient();
    const server = fakeServer(() => sessionFor("loja-a"));

    await reuseAppSession(queryClient, "loja-a", server.fetchSession);
    const second = await reuseAppSession(queryClient, "loja-a", server.fetchSession);

    expect(server.calls()).toBe(1);
    expect(second?.profileSlug).toBe("loja-a");
  });

  it("asks the server again once 30 seconds have passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START);
    const queryClient = newQueryClient();
    const server = fakeServer(() => sessionFor("loja-a"));
    await reuseAppSession(queryClient, "loja-a", server.fetchSession);

    vi.setSystemTime(START.getTime() + SESSION_REUSE_TIME_IN_MS + 1);
    await reuseAppSession(queryClient, "loja-a", server.fetchSession);

    expect(server.calls()).toBe(2);
  });

  it("keeps each tab profile's session apart", async () => {
    const queryClient = newQueryClient();
    const server = fakeServer((call) => sessionFor(call === 1 ? "loja-a" : "loja-b"));
    await reuseAppSession(queryClient, "loja-a", server.fetchSession);

    const other = await reuseAppSession(queryClient, "loja-b", server.fetchSession);

    expect(server.calls()).toBe(2);
    expect(other?.profileSlug).toBe("loja-b");
  });

  it("never keeps a signed-out answer, so a sign-in shows on the next click", async () => {
    const queryClient = newQueryClient();
    const server = fakeServer((call) => (call === 1 ? null : sessionFor("loja-a")));
    const signedOut = await reuseAppSession(queryClient, null, server.fetchSession);

    const signedIn = await reuseAppSession(queryClient, null, server.fetchSession);

    expect(signedOut).toBeNull();
    expect(signedIn?.profileSlug).toBe("loja-a");
    expect(server.calls()).toBe(2);
  });

  it("surfaces a failed ask at once instead of retrying it", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
    clients.push(queryClient);
    let calls = 0;
    const failing = async (): Promise<AppSession | null> => {
      calls += 1;
      throw new Error("network down");
    };

    await expect(reuseAppSession(queryClient, "loja-a", failing)).rejects.toThrow("network down");

    expect(calls).toBe(1);
  });
});

describe("forgetAppSession", () => {
  it("makes the next click ask the server again for every profile", async () => {
    const queryClient = newQueryClient();
    const server = fakeServer(() => sessionFor("loja-a"));
    await reuseAppSession(queryClient, "loja-a", server.fetchSession);
    await reuseAppSession(queryClient, "loja-b", server.fetchSession);

    forgetAppSession(queryClient);
    await reuseAppSession(queryClient, "loja-a", server.fetchSession);
    await reuseAppSession(queryClient, "loja-b", server.fetchSession);

    expect(server.calls()).toBe(4);
  });

  it("keeps the page data that is not the session", () => {
    const queryClient = newQueryClient();
    queryClient.setQueryData(["orders"], ["order-1"]);

    forgetAppSession(queryClient);

    expect(queryClient.getQueryData(["orders"])).toEqual(["order-1"]);
  });
});

describe("invalidateWithFreshSession", () => {
  it("forgets the session before the screens reload, passing the options along", async () => {
    const queryClient = newQueryClient();
    const server = fakeServer(() => sessionFor("loja-a"));
    await reuseAppSession(queryClient, "loja-a", server.fetchSession);
    const received: unknown[] = [];
    const invalidate = invalidateWithFreshSession(async (options?: { sync?: boolean }) => {
      received.push(options);
    }, queryClient);

    await invalidate({ sync: true });
    await reuseAppSession(queryClient, "loja-a", server.fetchSession);

    expect(received).toEqual([{ sync: true }]);
    expect(server.calls()).toBe(2);
  });
});
