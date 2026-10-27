import type { AdminReportRows } from "@sellbridge/database/repositories";
import type { ReportPeriod } from "@sellbridge/shared/report-period";
import { TICKET_CATEGORY_LABELS } from "@sellbridge/shared/schemas";
import {
  MONTHLY_REPORT_VERSION,
  type MonthlyReport,
  type ReportTeamRow,
} from "@/features/report-kit/report-model";
import { adminAttention, adminCases } from "./admin-report-cases";
import { adminCharts } from "./admin-report-charts";
import { adminIndicators } from "./admin-report-indicators";
import { adminTeamOf, periodRowsOf, type AdminTeamMember } from "./admin-report-rows";
import { adminReportRules } from "./admin-report-rules";

/** "Retrabalho": the share of a person's settled closes that came back. */
function reworkRate(member: AdminTeamMember): number | null {
  const noReopen = member.performance.noReopen.value;
  return noReopen === null ? null : 1 - noReopen;
}

/** Names are kept in the report (and its snapshot); the page hides them on request. */
export function teamRowOf(member: AdminTeamMember): ReportTeamRow {
  const { performance } = member;
  return {
    id: performance.id,
    name: performance.name,
    days: performance.activeDays,
    total: performance.resolved.current ?? 0,
    topCategory: member.topCategory === null ? null : TICKET_CATEGORY_LABELS[member.topCategory],
    medianMinutes: performance.firstResponseMinutes,
    onTimeRate: performance.onTime.value,
    reworkRate: reworkRate(member),
    averageRating: performance.rating.value,
    ratings: performance.rating.sample,
  };
}

/** The admin's monthly report of the support and the team, from the rows of the database. */
export function buildAdminReport(input: {
  rows: AdminReportRows;
  period: ReportPeriod;
  now: Date;
}): MonthlyReport {
  const { rows, period, now } = input;
  const periodRows = periodRowsOf(rows.performance, period);
  const { current } = periodRows;
  const empty =
    current.opened.length === 0 && current.resolutions.length === 0 && current.ratings.length === 0;
  return {
    version: MONTHLY_REPORT_VERSION,
    title: "Relatório do suporte e da equipe",
    itemNoun: "chamado",
    empty,
    indicators: adminIndicators({ rows, period: periodRows, from: period.from, now }),
    charts: adminCharts({ rows: rows.performance, period: periodRows, reportPeriod: period, now }),
    attention: adminAttention(periodRows, rows.performance.queue),
    cases: adminCases(periodRows, now),
    team: adminTeamOf(rows, periodRows, now).map(teamRowOf),
    rules: adminReportRules(period),
  };
}
