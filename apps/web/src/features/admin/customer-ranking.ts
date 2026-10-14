import type { CustomerSummary, IssueTriage } from "@sellbridge/database/repositories";
import {
  assessCustomerHealth,
  CUSTOMER_STAGES,
  ISSUE_SEVERITY,
  issueRank,
  type CustomerHealth,
  type CustomerIssue,
  type CustomerStage,
  type IssueSeverity,
} from "@sellbridge/shared/customer-health";
import {
  toPaginated,
  type CustomerIssueKind,
  type CustomerSort,
  type IssueQueue,
  type Paginated,
  type Pagination,
} from "@sellbridge/shared/schemas";

/** One customer with the health the admin views rank by. */
export type RankedCustomer = CustomerSummary & { health: CustomerHealth };

export type IssueCounts = Record<CustomerIssueKind, number>;

export type EntryTriage = Pick<IssueTriage, "assigneeId" | "assigneeName" | "snoozedUntil">;

export interface CustomerIssueEntry {
  customer: Pick<RankedCustomer, "id" | "name" | "email" | "city" | "state" | "banned">;
  score: number | null;
  issue: CustomerIssue;
  severity: IssueSeverity;
  /** What the team decided about this issue, or null while nobody touched it. */
  triage: EntryTriage | null;
}

export type QueueCounts = Record<IssueQueue, number>;

/** Triage rows by customer and issue kind, for joining onto the derived issues. */
export type TriageIndex = ReadonlyMap<string, EntryTriage>;

function triageKey(userId: string, kind: CustomerIssueKind): string {
  return `${userId}:${kind}`;
}

export function indexTriage(rows: readonly IssueTriage[]): TriageIndex {
  return new Map(rows.map((row) => [triageKey(row.userId, row.issueKind), row]));
}

/** How many customers a journey column shows before it only counts the rest. */
const JOURNEY_COLUMN_LIMIT = 12;
/** The queue shows this many issues at once; filtering by kind narrows the rest down. */
export const ISSUE_QUEUE_LIMIT = 100;

export interface JourneyColumn {
  stage: CustomerStage;
  total: number;
  customers: RankedCustomer[];
}

export function rankCustomers(rows: readonly CustomerSummary[], now: Date): RankedCustomer[] {
  return rows.map((row) => ({ ...row, health: assessCustomerHealth(row, now) }));
}

function hasIssue(customer: RankedCustomer, kind: CustomerIssueKind): boolean {
  return customer.health.issues.some((issue) => issue.kind === kind);
}

/** Customers with at least one open issue of each kind. */
export function countIssues(customers: readonly RankedCustomer[]): IssueCounts {
  const withIssue = (kind: CustomerIssueKind) =>
    customers.filter((customer) => hasIssue(customer, kind)).length;
  return {
    store: withIssue("store"),
    listings: withIssue("listings"),
    ticket: withIssue("ticket"),
    onboarding: withIssue("onboarding"),
    cooling: withIssue("cooling"),
  };
}

/** Blocked accounts have no score and sink to the bottom of the health ranking. */
function healthKey(customer: RankedCustomer): number {
  return customer.health.score ?? Number.POSITIVE_INFINITY;
}

const COMPARATORS: Record<CustomerSort, (left: RankedCustomer, right: RankedCustomer) => number> = {
  health: (left, right) => healthKey(left) - healthKey(right),
  revenue: (left, right) => right.recentRevenueCents - left.recentRevenueCents,
  name: (left, right) => left.name.localeCompare(right.name, "pt-BR"),
  recent: (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
};

export function pageOfCustomers(
  customers: readonly RankedCustomer[],
  options: { issue?: CustomerIssueKind | undefined; sort: CustomerSort } & Pagination,
): Paginated<RankedCustomer> {
  const { issue } = options;
  const filtered = issue ? customers.filter((customer) => hasIssue(customer, issue)) : customers;
  const sorted = filtered.toSorted(COMPARATORS[options.sort]);
  const start = (options.page - 1) * options.pageSize;
  return toPaginated(sorted.slice(start, start + options.pageSize), sorted.length, options);
}

/** Every open issue across customers, most urgent kind first, then the weakest account. */
export function listIssueEntries(
  customers: readonly RankedCustomer[],
  options: { kind?: CustomerIssueKind | undefined; triage: TriageIndex },
): CustomerIssueEntry[] {
  const entries = customers.flatMap((customer) =>
    customer.health.issues.map((issue) => ({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        city: customer.city,
        state: customer.state,
        banned: customer.banned,
      },
      score: customer.health.score,
      issue,
      severity: ISSUE_SEVERITY[issue.kind],
      triage: options.triage.get(triageKey(customer.id, issue.kind)) ?? null,
    })),
  );
  const { kind } = options;
  const matching = kind ? entries.filter((entry) => entry.issue.kind === kind) : entries;
  return matching.toSorted(
    (left, right) =>
      issueRank(left.issue.kind) - issueRank(right.issue.kind) ||
      (left.score ?? 0) - (right.score ?? 0),
  );
}

function isSnoozed(entry: CustomerIssueEntry, now: Date): boolean {
  const until = entry.triage?.snoozedUntil;
  return until !== null && until !== undefined && until > now;
}

function inQueue(entry: CustomerIssueEntry, queue: IssueQueue, adminId: string, now: Date) {
  if (queue === "snoozed") {
    return isSnoozed(entry, now);
  }
  if (isSnoozed(entry, now)) {
    return false;
  }
  return queue === "open" || entry.triage?.assigneeId === adminId;
}

/** The slice of the queue an admin asked for: everything open, what they took, or snoozed. */
export function filterQueue(
  entries: readonly CustomerIssueEntry[],
  queue: IssueQueue,
  adminId: string,
  now: Date,
): CustomerIssueEntry[] {
  return entries.filter((entry) => inQueue(entry, queue, adminId, now));
}

export function countQueues(
  entries: readonly CustomerIssueEntry[],
  adminId: string,
  now: Date,
): QueueCounts {
  return {
    open: filterQueue(entries, "open", adminId, now).length,
    mine: filterQueue(entries, "mine", adminId, now).length,
    snoozed: filterQueue(entries, "snoozed", adminId, now).length,
  };
}

/** Customers grouped by stage, the weakest first in each column; blocked accounts stay out. */
export function buildJourney(customers: readonly RankedCustomer[]): JourneyColumn[] {
  return CUSTOMER_STAGES.map((stage) => {
    const inStage = customers
      .filter((customer) => customer.health.stage === stage)
      .toSorted(COMPARATORS.health);
    return { stage, total: inStage.length, customers: inStage.slice(0, JOURNEY_COLUMN_LIMIT) };
  });
}
