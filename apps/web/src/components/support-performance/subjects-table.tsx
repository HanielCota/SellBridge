import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import {
  subjectKeyOf,
  type SubjectPerformance,
  type SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { HintedText } from "@/components/ui/hint";
import {
  EMPTY_FIGURE,
  ORIGIN_LABELS,
  formatMinutes,
  formatRate,
  formatRating,
  rateSampleText,
  subjectLabel,
  subjectQueueSearch,
  topicLabel,
} from "@/features/support/performance-format";
import { cn } from "@/lib/utils";
import { TopicsChart, TopicsLegend } from "./topics-chart";

/*
 * Complaints by subject: each topic with its situations under it, how they moved against the
 * previous period and how well the team solves them. "Melhor resultado" names who to learn from.
 */

const count = new Intl.NumberFormat("pt-BR");
const RISING_FROM = 3;

interface TopicGroup {
  key: string;
  origin: ProfileKind;
  category: SubjectPerformance["category"];
  subjects: SubjectPerformance[];
}

function topicGroups(subjects: readonly SubjectPerformance[]): TopicGroup[] {
  const groups = new Map<string, TopicGroup>();
  for (const subject of subjects) {
    const key = `${subject.origin}|${subject.category}`;
    const group = groups.get(key) ?? {
      key,
      origin: subject.origin,
      category: subject.category,
      subjects: [],
    };
    groups.set(key, { ...group, subjects: [...group.subjects, subject] });
  }
  return [...groups.values()];
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const difference = current - previous;
  if (difference === 0) {
    return <span className="text-muted-foreground">=</span>;
  }
  const rising = difference >= RISING_FROM;
  return (
    <span
      className={cn(
        rising ? "font-medium text-destructive" : "text-muted-foreground",
        difference < 0 && "text-brand-text",
      )}
    >
      {difference > 0 ? "+" : "−"}
      {count.format(Math.abs(difference))}
    </span>
  );
}

function SubjectRow({
  subject,
  nameOf,
}: {
  subject: SubjectPerformance;
  nameOf: (id: string | null) => string;
}) {
  return (
    <tr>
      <th scope="row" className="py-3 pr-3 pl-4 text-left font-normal">
        <Link
          to="/admin/chamados"
          search={subjectQueueSearch(subject)}
          className="rounded outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {subjectLabel(subject)}
        </Link>
      </th>
      <td className="px-3 py-3 text-right font-medium">{count.format(subject.opened.current)}</td>
      <td className="px-3 py-3 text-right">
        <Delta current={subject.opened.current} previous={subject.opened.previous} />
      </td>
      <td className="px-3 py-3 text-right">{formatMinutes(subject.resolveMinutes)}</td>
      <td className="px-3 py-3 text-right">
        <HintedText label={rateSampleText(subject.noReopen, "encerrados")}>
          {formatRate(subject.noReopen)}
        </HintedText>
      </td>
      <td className="px-3 py-3 text-right">{formatRating(subject.rating.value)}</td>
      <td className="py-3 pl-3 text-left text-muted-foreground">{nameOf(subject.bestAgentId)}</td>
    </tr>
  );
}

function TopicRows({
  group,
  nameOf,
  showOrigin,
}: {
  group: TopicGroup;
  nameOf: (id: string | null) => string;
  showOrigin: boolean;
}) {
  const opened = group.subjects.reduce((sum, subject) => sum + subject.opened.current, 0);
  const previous = group.subjects.reduce((sum, subject) => sum + subject.opened.previous, 0);
  return (
    <Fragment>
      <tr className="bg-muted/40">
        <th scope="rowgroup" className="rounded-l-lg py-2.5 pr-3 pl-2 text-left font-medium">
          {topicLabel(group.origin, group.category)}
          {showOrigin ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {ORIGIN_LABELS[group.origin]}
            </span>
          ) : null}
        </th>
        <td className="px-3 py-2.5 text-right font-medium">{count.format(opened)}</td>
        <td className="px-3 py-2.5 text-right">
          <Delta current={opened} previous={previous} />
        </td>
        <td colSpan={4} className="rounded-r-lg">
          <span className="sr-only">Detalhes nas linhas abaixo</span>
        </td>
      </tr>
      {group.subjects.map((subject) => (
        <SubjectRow key={subjectKeyOf(subject)} subject={subject} nameOf={nameOf} />
      ))}
    </Fragment>
  );
}

const HEADERS = ["Chamados", "Antes", "Até resolver", "Sem reabrir", "Nota"] as const;

function SubjectsTableHead() {
  return (
    <thead>
      <tr className="text-xs text-muted-foreground">
        <th scope="col" className="pb-2 text-left font-normal">
          Assunto
        </th>
        {HEADERS.map((header) => (
          <th key={header} scope="col" className="px-3 pb-2 text-right font-normal">
            {header === "Antes" ? (
              <HintedText
                label="Diferença para o período anterior do mesmo tamanho"
                className="hinted-term"
              >
                {header}
              </HintedText>
            ) : (
              header
            )}
          </th>
        ))}
        <th scope="col" className="pb-2 pl-3 text-left font-normal">
          <HintedText
            label="Quem mais resolveu sem o cliente voltar, com ao menos 5 encerrados"
            className="hinted-term"
          >
            Melhor resultado
          </HintedText>
        </th>
      </tr>
    </thead>
  );
}

function TopicsChartCard({ report }: { report: SupportPerformanceReport }) {
  return (
    <section
      aria-labelledby="topics-chart-title"
      className="surface-card flex flex-col gap-5 rounded-3xl bg-card p-5"
    >
      <h2 id="topics-chart-title" className="text-subhead font-medium text-muted-foreground">
        Temas por {report.bucket === "day" ? "dia" : "semana"}
      </h2>
      <TopicsLegend />
      <figure aria-label="Gráfico: chamados por tema" className="relative h-64 overflow-hidden">
        <TopicsChart report={report} />
      </figure>
    </section>
  );
}

function SubjectsTableCard({ report }: { report: SupportPerformanceReport }) {
  const names = new Map(
    report.team.map((agent) => [agent.id, agent.name.split(" ")[0] ?? agent.name]),
  );
  const nameOf = (id: string | null) =>
    id === null ? EMPTY_FIGURE : (names.get(id) ?? EMPTY_FIGURE);
  const groups = topicGroups(report.subjects);
  return (
    <section
      aria-labelledby="subjects-table-title"
      className="surface-card rounded-3xl bg-card p-5"
    >
      <h2 id="subjects-table-title" className="text-subhead font-medium text-muted-foreground">
        Assuntos
      </h2>
      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum chamado no período.</p>
      ) : (
        <div className="relative mt-5 overflow-x-auto">
          <table className="w-full min-w-[48rem] border-separate border-spacing-0 text-sm tabular-nums">
            <SubjectsTableHead />
            <tbody>
              {groups.map((group) => (
                <TopicRows
                  key={group.key}
                  group={group}
                  nameOf={nameOf}
                  showOrigin={new Set(report.subjects.map((subject) => subject.origin)).size > 1}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function SubjectsSection({ report }: { report: SupportPerformanceReport }) {
  return (
    <div className="space-y-4">
      <TopicsChartCard report={report} />
      <SubjectsTableCard report={report} />
    </div>
  );
}
