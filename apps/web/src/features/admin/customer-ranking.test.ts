import type { CustomerSummary } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import {
  buildJourney,
  countIssues,
  countQueues,
  filterQueue,
  indexTriage,
  listIssueEntries,
  pageOfCustomers,
  rankCustomers,
} from "./customer-ranking";

const NOW = new Date("2026-10-11T12:00:00Z");
const DAY = 86_400_000;

function customer(id: string, overrides: Partial<CustomerSummary> = {}): CustomerSummary {
  return {
    id,
    name: `Cliente ${id}`,
    email: `${id}@sellbridge.test`,
    emailVerified: true,
    role: "user",
    banned: false,
    banReason: null,
    createdAt: new Date(NOW.getTime() - 60 * DAY),
    tenantId: `tenant-${id}`,
    city: "Campinas",
    state: "SP",
    connectedStores: 1,
    publishedListings: 5,
    failedListings: 0,
    recentOrders: 10,
    recentRevenueCents: 100_000,
    previousOrders: 10,
    hasRegion: true,
    stores: [{ marketplace: "shopee", shopName: "Loja", status: "connected" }],
    waitingTickets: 0,
    lastSeenAt: NOW,
    ...overrides,
  };
}

const ranked = rankCustomers(
  [
    customer("healthy", { recentRevenueCents: 500_000 }),
    customer("broken", {
      stores: [{ marketplace: "shopee", shopName: "Loja", status: "expired" }],
      failedListings: 2,
    }),
    customer("ticket", { waitingTickets: 1, recentRevenueCents: 0 }),
    customer("new", { publishedListings: 0, createdAt: new Date(NOW.getTime() - 10 * DAY) }),
    customer("blocked", { banned: true }),
  ],
  NOW,
);

describe("customer ranking", () => {
  it("counts customers per issue kind", () => {
    expect(countIssues(ranked)).toEqual({
      store: 1,
      listings: 1,
      ticket: 1,
      onboarding: 1,
      cooling: 0,
    });
  });

  it("puts the weakest first and blocked accounts last", () => {
    const page = pageOfCustomers(ranked, { sort: "health", page: 1, pageSize: 10 });
    expect(page.items.map((item) => item.id)).toEqual([
      "broken",
      "new",
      "ticket",
      "healthy",
      "blocked",
    ]);
  });

  it("filters by issue and paginates the result", () => {
    const page = pageOfCustomers(ranked, {
      issue: "ticket",
      sort: "revenue",
      page: 1,
      pageSize: 5,
    });
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe("ticket");

    const second = pageOfCustomers(ranked, { sort: "revenue", page: 2, pageSize: 2 });
    expect(second.totalPages).toBe(3);
    expect(second.items).toHaveLength(2);
  });

  it("lists every issue, most urgent kind first", () => {
    const entries = listIssueEntries(ranked, { triage: indexTriage([]) });
    expect(entries.map((entry) => entry.issue.kind)).toEqual([
      "store",
      "listings",
      "ticket",
      "onboarding",
    ]);
    const onboarding = listIssueEntries(ranked, { kind: "onboarding", triage: indexTriage([]) });
    expect(onboarding.map((entry) => entry.customer.id)).toEqual(["new"]);
  });

  it("splits the queue into open, taken and snoozed issues", () => {
    const triage = indexTriage([
      {
        userId: "broken",
        issueKind: "store",
        assigneeId: "admin",
        assigneeName: "Admin",
        snoozedUntil: null,
      },
      {
        userId: "ticket",
        issueKind: "ticket",
        assigneeId: null,
        assigneeName: null,
        snoozedUntil: new Date(NOW.getTime() + DAY),
      },
      {
        userId: "new",
        issueKind: "onboarding",
        assigneeId: "admin",
        assigneeName: "Admin",
        snoozedUntil: new Date(NOW.getTime() - DAY),
      },
    ]);
    const entries = listIssueEntries(ranked, { triage });
    expect(countQueues(entries, "admin", NOW)).toEqual({ open: 3, mine: 2, snoozed: 1 });
    expect(filterQueue(entries, "mine", "admin", NOW).map((entry) => entry.issue.kind)).toEqual([
      "store",
      "onboarding",
    ]);
    expect(filterQueue(entries, "snoozed", "admin", NOW)[0]?.customer.id).toBe("ticket");
  });

  it("groups customers by stage and leaves blocked ones out", () => {
    const journey = buildJourney(ranked);
    const ids = Object.fromEntries(
      journey.map((column) => [column.stage, column.customers.map((item) => item.id)]),
    );
    expect(ids).toEqual({
      setup: ["new"],
      selling: ["ticket", "healthy"],
      at_risk: ["broken"],
      cooling: [],
    });
  });
});
