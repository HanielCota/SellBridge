import {
  listAuditEntries,
  listCustomerSignals,
  listProfileExportFacts,
  listTicketsForExport,
  MAX_CUSTOMERS_RANKED,
  type ProfileExportFacts,
} from "@sellbridge/database/repositories";
import { isStaffRole } from "@sellbridge/shared/staff-access";
import { rankCustomers, type RankedCustomer } from "@/features/admin/customer-ranking";
import { database } from "@/lib/server/database";
import {
  auditCsv,
  clientsCsv,
  teamAliases,
  teamCsv,
  ticketsCsv,
  type ClientExportRow,
  type CsvTable,
} from "./admin-export-csv";
import type { ExportLoadInput } from "./admin-export.server";
import { adminTeamOf, periodRowsOf } from "./admin-report-rows";
import { loadAdminReportRows } from "./admin-report.server";

/** The period's team, worked out exactly as the report's team table. */
async function periodTeam(input: ExportLoadInput) {
  const rows = await loadAdminReportRows(input.period, input.now);
  return adminTeamOf(rows, periodRowsOf(rows.performance, input.period), input.now);
}

export async function loadTeamCsv(input: ExportLoadInput): Promise<CsvTable> {
  return teamCsv(await periodTeam(input), input.names);
}

export async function loadTicketsCsv(input: ExportLoadInput): Promise<CsvTable> {
  const [team, tickets] = await Promise.all([
    periodTeam(input),
    listTicketsForExport(database, { window: input.period, limit: input.limit }),
  ]);
  return ticketsCsv(tickets, {
    aliases: teamAliases(team, input.names),
    names: input.names,
    now: input.now,
  });
}

function clientRow(
  customer: RankedCustomer,
  facts: ProfileExportFacts | undefined,
): ClientExportRow {
  return {
    profileName: facts?.profileName ?? customer.name,
    kind: facts?.kind ?? null,
    createdAt: customer.createdAt,
    lastSeenAt: customer.lastSeenAt,
    plan: facts?.plan ?? null,
    billingStatus: facts?.billingStatus ?? null,
    connectedStores: customer.connectedStores,
    ordersInWindow: facts?.kind === "seller" ? facts.ordersInWindow : null,
    healthScore: customer.health.score,
    healthLevel: customer.health.level,
  };
}

/** Every customer account (the team's own accounts left out), as the "Clientes" list ranks it. */
export async function loadClientsCsv(input: ExportLoadInput): Promise<CsvTable> {
  const signals = await listCustomerSignals(database, {}, input.now);
  const customers = rankCustomers(
    signals.slice(0, MAX_CUSTOMERS_RANKED).filter((row) => !isStaffRole(row.role)),
    input.now,
  );
  const tenantIds = customers.flatMap((customer) =>
    customer.tenantId === null ? [] : [customer.tenantId],
  );
  const facts = await listProfileExportFacts(database, { tenantIds, window: input.period });
  const byTenant = new Map(facts.map((row) => [row.tenantId, row]));
  return clientsCsv(
    customers.map((customer) =>
      clientRow(customer, customer.tenantId === null ? undefined : byTenant.get(customer.tenantId)),
    ),
  );
}

export async function loadAuditCsv(input: ExportLoadInput): Promise<CsvTable> {
  const page = await listAuditEntries(database, {
    page: 1,
    pageSize: input.limit + 1,
    from: input.period.from,
    to: input.period.to,
  });
  return auditCsv(page.items);
}
