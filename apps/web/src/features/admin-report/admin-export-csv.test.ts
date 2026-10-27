import type { AuditEntry, TicketExportRow } from "@sellbridge/database/repositories";
import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import { describe, expect, it } from "vitest";
import { buildCsvFile } from "@/features/report-kit/csv-file";
import {
  AUDIT_HEADERS,
  auditCsv,
  CLIENT_HEADERS,
  clientsCsv,
  TEAM_HEADERS,
  teamAliases,
  teamCsv,
  TICKET_HEADERS,
  ticketsCsv,
} from "./admin-export-csv";
import { adminRows, ANA, NOW } from "./admin-report-fixtures";
import { adminTeamOf, periodRowsOf } from "./admin-report-rows";

const SEPTEMBER = resolveReportPeriod({ mes: "2026-09" }, NOW);
const PRIVATE_COLUMN = /e-?mail|telefone|celular|cpf|cnpj|endere/i;

function team() {
  const rows = adminRows();
  return adminTeamOf(rows, periodRowsOf(rows.performance, SEPTEMBER), NOW);
}

const TICKET: TicketExportRow = {
  id: "abcdef12-0000-0000-0000-000000000000",
  createdAt: new Date("2026-09-02T13:00:00.000Z"),
  closedAt: new Date("2026-09-04T13:00:00.000Z"),
  category: "order",
  situationId: null,
  priority: "high",
  origin: "seller",
  status: "closed",
  profileName: "Loja da Maria",
  assigneeId: ANA.id,
  assigneeName: ANA.name,
  firstResponseAt: new Date("2026-09-02T14:30:00.000Z"),
  reopened: true,
  rating: 4,
};

describe("admin spreadsheets", () => {
  it("never has a column for e-mail, phone, CPF or address", () => {
    for (const headers of [TEAM_HEADERS, TICKET_HEADERS, CLIENT_HEADERS, AUDIT_HEADERS]) {
      expect(headers.filter((header) => PRIVATE_COLUMN.test(header))).toEqual([]);
    }
  });

  it("writes one row per person, with the former member marked and few ratings flagged", () => {
    const table = teamCsv(team(), true);
    expect(table.rows.map((row) => row[0])).toEqual(["Ana Souza", "Bia Lima", "Carla Dias"]);
    expect(table.rows[0]?.slice(1, 5)).toEqual(["Atendente", 2, 1, 2]);
    expect(table.rows[2]?.[1]).toBe("Saiu da equipe");
    expect(table.rows[1]?.at(-1)).toBe("Sim");
  });

  it("numbers the team instead of naming it when the names are off", () => {
    const members = team();
    const anonymous = teamCsv(members, false);
    const file = buildCsvFile(anonymous.headers, anonymous.rows);
    expect(file).not.toContain("Ana Souza");
    expect(file).toContain("Atendente 1");
    const aliases = teamAliases(members, false);
    const tickets = ticketsCsv(
      [TICKET, { ...TICKET, assigneeId: "someone-else", assigneeName: "Zé" }],
      {
        aliases,
        names: false,
        now: NOW,
      },
    );
    expect(tickets.rows[0]?.[9]).toBe("Atendente 1");
    expect(tickets.rows[1]?.[9]).toBe("Atendente sem atividade no período");
    expect(JSON.stringify(tickets.rows)).not.toContain("Zé");
  });

  it("writes each ticket with its deadline verdict and no customer contact", () => {
    const row = ticketsCsv([TICKET], { aliases: new Map(), names: true, now: NOW }).rows[0];
    expect(row?.[0]).toBe("ABCDEF");
    expect(row?.slice(5, 10)).toEqual([
      "Alta",
      "Revendedor",
      "Encerrado",
      "Loja da Maria",
      "Ana Souza",
    ]);
    expect(row?.slice(10)).toEqual([90, "Sim", "Sim", 4]);
    const waiting = ticketsCsv(
      [{ ...TICKET, createdAt: new Date(NOW.getTime() - 60_000), firstResponseAt: null }],
      { aliases: new Map(), names: true, now: NOW },
    ).rows[0];
    expect(waiting?.[11]).toBe("Aguardando");
  });

  it("writes customers by profile, with plan, orders and health", () => {
    const table = clientsCsv([
      {
        profileName: "Loja da Maria",
        kind: "seller",
        createdAt: new Date("2026-01-10T12:00:00.000Z"),
        lastSeenAt: null,
        plan: "pro",
        billingStatus: "past_due",
        connectedStores: 2,
        ordersInWindow: 31,
        healthScore: 64,
        healthLevel: "attention",
      },
    ]);
    expect(table.rows[0]).toEqual([
      "Loja da Maria",
      "Revendedor",
      { day: new Date("2026-01-10T12:00:00.000Z") },
      { date: null },
      "pro",
      "Pagamento atrasado",
      2,
      31,
      64,
      "Atenção",
    ]);
  });

  it("writes the audit in the team's words", () => {
    const entry: AuditEntry = {
      id: "1",
      source: "account",
      action: "report.exported",
      actorId: "x",
      actorName: "Bia Lima",
      subjectLabel: null,
      subjectId: null,
      entityType: null,
      details: { kind: "clientes", period: "2026-09", names: true },
      createdAt: NOW,
    };
    expect(auditCsv([entry]).rows[0]?.slice(1)).toEqual([
      "Bia Lima",
      "Conta do cliente",
      "Baixou a planilha dos clientes de Setembro de 2026",
      null,
    ]);
  });
});
