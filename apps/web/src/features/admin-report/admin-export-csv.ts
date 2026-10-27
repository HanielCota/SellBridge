import type { AuditEntry, TicketExportRow } from "@sellbridge/database/repositories";
import type { HealthLevel } from "@sellbridge/shared/customer-health";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@sellbridge/shared/schemas";
import { STAFF_ROLE_LABELS } from "@sellbridge/shared/staff-access";
import { answeredOnTime, minutesBetween } from "@sellbridge/shared/support-performance";
import { RESPONSE_TARGET_HOURS, ticketCode } from "@sellbridge/shared/ticket-rules";
import {
  auditActorLabel,
  AUDIT_SOURCE_LABELS,
  describeAuditEntry,
} from "@/features/admin-audit/audit-copy";
import type { CsvValue } from "@/features/report-kit/csv-file";
import { MIN_RATINGS_FOR_AVERAGE } from "@/features/report-kit/report-model";
import { subjectLabel, topicLabel } from "@/features/support/performance-format";
import type { AdminTeamMember } from "./admin-report-rows";

/*
 * The rows of the admin spreadsheets, as plain cells. Privacy by construction: no column takes
 * an e-mail, phone, CPF or address, and with `names: false` every team member is "Atendente N",
 * numbered in the same order as the report's team table.
 */

export interface CsvTable {
  headers: readonly string[];
  rows: CsvValue[][];
}

const HOUR_MILLISECONDS = 3_600_000;
const ORIGIN_LABELS: Record<ProfileKind, string> = { seller: "Revendedor", supplier: "Fornecedor" };
const YES = "Sim";
const NO = "Não";

/** Label of each team member: the name, or "Atendente N" in the team's order. */
export function teamAliases(
  members: readonly Pick<AdminTeamMember, "performance">[],
  names: boolean,
): Map<string, string> {
  return new Map(
    members.map((member, index) => [
      member.performance.id,
      names ? member.performance.name : `Atendente ${index + 1}`,
    ]),
  );
}

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

export const TEAM_HEADERS = [
  "Pessoa",
  "Papel",
  "Dias trabalhados",
  "Chamados encerrados",
  "Respostas",
  "Encerrados por dia",
  "Assunto principal",
  "Primeira resposta mediana (min)",
  "No prazo (%)",
  "Reabertos (%)",
  "Nota média",
  "Nº de notas",
  "Poucas notas",
] as const;

export function teamCsv(members: readonly AdminTeamMember[], names: boolean): CsvTable {
  const aliases = teamAliases(members, names);
  const rows = members.map((member) => {
    const { performance } = member;
    const total = performance.resolved.current ?? 0;
    const noReopen = performance.noReopen.value;
    return [
      aliases.get(performance.id) ?? "",
      member.former ? "Saiu da equipe" : STAFF_ROLE_LABELS[performance.role],
      performance.activeDays,
      total,
      member.replies,
      performance.activeDays === 0 ? null : Math.round((total / performance.activeDays) * 10) / 10,
      member.topCategory === null ? null : TICKET_CATEGORY_LABELS[member.topCategory],
      rounded(performance.firstResponseMinutes),
      { rate: performance.onTime.value },
      { rate: noReopen === null ? null : 1 - noReopen },
      performance.rating.value === null ? null : Math.round(performance.rating.value * 10) / 10,
      performance.rating.sample,
      performance.rating.sample < MIN_RATINGS_FOR_AVERAGE ? YES : NO,
    ] satisfies CsvValue[];
  });
  return { headers: TEAM_HEADERS, rows };
}

export const TICKET_HEADERS = [
  "Número",
  "Aberto em",
  "Encerrado em",
  "Tema",
  "Assunto",
  "Prioridade",
  "Origem",
  "Situação",
  "Cliente (perfil)",
  "Responsável",
  "Primeira resposta (min)",
  "Dentro do prazo",
  "Reaberto",
  "Nota",
] as const;

/** "Sim", "Não", or "Aguardando" while an unanswered ticket is still inside its deadline. */
function onTimeCell(row: TicketExportRow, now: Date): string {
  const deadline =
    row.createdAt.getTime() + RESPONSE_TARGET_HOURS[row.priority] * HOUR_MILLISECONDS;
  if (row.firstResponseAt === null && deadline >= now.getTime()) {
    return "Aguardando";
  }
  return answeredOnTime({ ...row, ticketId: row.id, tenantId: "", firstResponderId: null })
    ? YES
    : NO;
}

function assigneeCell(row: TicketExportRow, aliases: ReadonlyMap<string, string>, names: boolean) {
  if (row.assigneeId === null) {
    return "Sem responsável";
  }
  const alias = aliases.get(row.assigneeId);
  if (alias !== undefined) {
    return alias;
  }
  // Not in the period's team (did not reply or close): named only when names are on.
  return names ? (row.assigneeName ?? "Usuário removido") : "Atendente sem atividade no período";
}

export function ticketsCsv(
  tickets: readonly TicketExportRow[],
  input: { aliases: ReadonlyMap<string, string>; names: boolean; now: Date },
): CsvTable {
  const rows = tickets.map((row) => {
    const subject = { origin: row.origin, category: row.category, situationId: row.situationId };
    return [
      ticketCode(row.id),
      { date: row.createdAt },
      { date: row.status === "closed" ? row.closedAt : null },
      topicLabel(row.origin, row.category),
      subjectLabel(subject),
      TICKET_PRIORITY_LABELS[row.priority],
      ORIGIN_LABELS[row.origin],
      TICKET_STATUS_LABELS[row.status],
      row.profileName,
      assigneeCell(row, input.aliases, input.names),
      row.firstResponseAt === null
        ? null
        : Math.round(minutesBetween(row.createdAt, row.firstResponseAt)),
      onTimeCell(row, input.now),
      row.reopened ? YES : NO,
      row.rating,
    ] satisfies CsvValue[];
  });
  return { headers: TICKET_HEADERS, rows };
}

export interface ClientExportRow {
  profileName: string;
  kind: ProfileKind | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  plan: string | null;
  billingStatus: string | null;
  connectedStores: number;
  ordersInWindow: number | null;
  healthScore: number | null;
  healthLevel: HealthLevel | null;
}

const HEALTH_LABELS: Record<HealthLevel, string> = {
  healthy: "Bem",
  attention: "Atenção",
  critical: "Crítico",
};

const BILLING_STATUS_LABELS: Readonly<Record<string, string>> = {
  free: "Grátis",
  active: "Ativa",
  trialing: "Em teste",
  past_due: "Pagamento atrasado",
  canceled: "Cancelada",
  unpaid: "Não paga",
  incomplete: "Incompleta",
};

export const CLIENT_HEADERS = [
  "Perfil",
  "Tipo",
  "Criado em",
  "Último acesso",
  "Plano",
  "Assinatura",
  "Lojas conectadas",
  "Pedidos no período",
  "Saúde (0–100)",
  "Situação",
] as const;

export function clientsCsv(clients: readonly ClientExportRow[]): CsvTable {
  const rows = clients.map(
    (client) =>
      [
        client.profileName,
        client.kind === null ? "Sem perfil" : ORIGIN_LABELS[client.kind],
        { day: client.createdAt },
        { date: client.lastSeenAt },
        client.plan,
        client.billingStatus === null
          ? null
          : (BILLING_STATUS_LABELS[client.billingStatus] ?? client.billingStatus),
        client.connectedStores,
        client.ordersInWindow,
        client.healthScore,
        client.healthLevel === null ? "Conta bloqueada" : HEALTH_LABELS[client.healthLevel],
      ] satisfies CsvValue[],
  );
  return { headers: CLIENT_HEADERS, rows };
}

export const AUDIT_HEADERS = ["Quando", "Quem", "Origem", "Ação", "Sobre o quê"] as const;

export function auditCsv(entries: readonly AuditEntry[]): CsvTable {
  const rows = entries.map(
    (entry) =>
      [
        { date: entry.createdAt },
        auditActorLabel(entry),
        AUDIT_SOURCE_LABELS[entry.source],
        describeAuditEntry(entry),
        entry.subjectLabel,
      ] satisfies CsvValue[],
  );
  return { headers: AUDIT_HEADERS, rows };
}
