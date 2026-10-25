import type {
  AgentPerformance,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { DeltaBadge } from "@/components/reports/figures";
import { StatTile, type StatTileProps } from "@/components/reports/stat-tile";
import {
  changeCopy,
  formatMinutes,
  formatRate,
  formatRating,
  rateSampleText,
  type ChangeCopy,
} from "@/features/support/performance-format";
import { formatPercent } from "@/lib/percent";

/*
 * The column of tiles beside the chart: the same anatomy as the sales dashboard's (name, figure,
 * how it moved, sparkline). Arrows show the direction; the color says whether it is good news,
 * so a first response that drops reads green.
 */

const count = new Intl.NumberFormat("pt-BR");

function toneOf(good: boolean | null): string {
  if (good === null) {
    return "text-muted-foreground";
  }
  return good ? "text-brand-text" : "text-destructive";
}

function Change({ copy, suffix }: { copy: ChangeCopy | null; suffix: string }) {
  if (copy === null) {
    return <span className="text-muted-foreground">{suffix}</span>;
  }
  return (
    <DeltaBadge
      direction={copy.direction}
      label={copy.label}
      suffix={suffix}
      className={toneOf(copy.good)}
    />
  );
}

function Figure({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="font-semibold tracking-tight tabular-nums">
      {value}
      {unit ? (
        <span className="ml-1 text-sm font-medium tracking-normal text-muted-foreground">
          {unit}
        </span>
      ) : null}
    </span>
  );
}

function numbers(values: readonly (number | null)[]): number[] {
  return values.flatMap((value) => (value === null ? [] : [value]));
}

const VERSUS = "vs. anterior";

function TileColumn({ tiles }: { tiles: readonly StatTileProps[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
      {tiles.map((tile) => (
        <StatTile key={tile.label} {...tile} />
      ))}
    </div>
  );
}

function boardVolumeTiles(report: SupportPerformanceReport): StatTileProps[] {
  const { overview, series } = report;
  return [
    {
      label: "Resolvidos",
      hint: "Chamados encerrados no período, por qualquer pessoa ou pelo próprio cliente",
      figure: <Figure value={count.format(overview.resolved.current ?? 0)} />,
      change: <Change copy={changeCopy({ ...overview.resolved, kind: "count" })} suffix={VERSUS} />,
      trend: series.map((point) => point.resolved),
    },
    {
      label: "Primeira resposta",
      isTerm: true,
      hint: "Metade dos chamados recebeu a primeira resposta em até esse tempo (mediana)",
      figure: <Figure value={formatMinutes(overview.firstResponseMinutes.current)} />,
      change: (
        <Change
          copy={changeCopy({
            ...overview.firstResponseMinutes,
            kind: "minutes",
            lowerIsBetter: true,
          })}
          suffix={VERSUS}
        />
      ),
      trend: numbers(series.map((point) => point.firstResponseMinutes)),
    },
  ];
}

function boardQualityTiles(report: SupportPerformanceReport): StatTileProps[] {
  const { overview, series } = report;
  const ratingShare = overview.ratingRate === null ? null : formatPercent(overview.ratingRate);
  const noReopenChange = changeCopy({
    current: overview.noReopen.value,
    previous: overview.previousNoReopen.value,
    kind: "rate",
  });
  return [
    {
      label: "Resolvidos sem reabrir",
      isTerm: true,
      hint: `Encerrados há mais de 7 dias que o cliente não reabriu nem trouxe de volta: ${rateSampleText(overview.noReopen, "encerrados")}`,
      figure: <Figure value={formatRate(overview.noReopen)} />,
      change:
        overview.noReopen.sample === 0 && (overview.resolved.current ?? 0) > 0 ? (
          <span className="text-muted-foreground">Encerrados há menos de 7 dias</span>
        ) : (
          <Change copy={noReopenChange} suffix={VERSUS} />
        ),
      trend: numbers(series.map((point) => point.noReopenRate)),
    },
    {
      label: "Nota dos clientes",
      hint: `Média das avaliações: ${overview.rating.sample} no período`,
      figure: <Figure value={formatRating(overview.rating.value)} unit="/ 5" />,
      change: (
        <span className="text-muted-foreground">
          {ratingShare === null ? "Sem avaliações" : `${ratingShare} dos resolvidos avaliaram`}
        </span>
      ),
      trend: numbers(series.map((point) => point.rating)),
    },
  ];
}

/** The team's four tiles: how much, how fast, how well and how the customers felt. */
export function BoardTiles({ report }: { report: SupportPerformanceReport }) {
  return <TileColumn tiles={[...boardVolumeTiles(report), ...boardQualityTiles(report)]} />;
}

/** The team's own figures, the yardstick on a person's sheet. */
export interface TeamYardstick {
  resolvedPerAgent: number | null;
  firstResponseMinutes: number | null;
  rating: number | null;
}

function versusTeam(text: string) {
  return `· equipe ${text}`;
}

function personVolumeTiles(agent: AgentPerformance, team: TeamYardstick): StatTileProps[] {
  const resolved = agent.resolved.current ?? 0;
  const perAgent = team.resolvedPerAgent === null ? "—" : formatRating(team.resolvedPerAgent);
  return [
    {
      label: "Resolvidos",
      hint: `${agent.activeDays} ${agent.activeDays === 1 ? "dia ativo" : "dias ativos"} no período`,
      figure: <Figure value={count.format(resolved)} />,
      change: (
        <Change
          copy={changeCopy({ current: resolved, previous: team.resolvedPerAgent, kind: "count" })}
          suffix={versusTeam(perAgent)}
        />
      ),
      trend: agent.resolvedSeries,
    },
    {
      label: "Primeira resposta",
      isTerm: true,
      hint: "Mediana da primeira resposta nos chamados que a pessoa respondeu primeiro",
      figure: <Figure value={formatMinutes(agent.firstResponseMinutes)} />,
      change: (
        <Change
          copy={changeCopy({
            current: agent.firstResponseMinutes,
            previous: team.firstResponseMinutes,
            kind: "minutes",
            lowerIsBetter: true,
          })}
          suffix={versusTeam(formatMinutes(team.firstResponseMinutes))}
        />
      ),
      trend: [],
    },
  ];
}

function personQualityTiles(agent: AgentPerformance, team: TeamYardstick): StatTileProps[] {
  const expected = agent.expectedNoReopen === null ? "—" : formatPercent(agent.expectedNoReopen);
  return [
    {
      label: "Sem reabrir",
      isTerm: true,
      hint: `Comparado com o que a equipe consegue nos mesmos assuntos: ${rateSampleText(agent.noReopen, "resolvidos")}`,
      figure: <Figure value={formatRate(agent.noReopen)} />,
      change: (
        <Change
          copy={changeCopy({
            current: agent.noReopen.value,
            previous: agent.expectedNoReopen,
            kind: "rate",
          })}
          suffix={versusTeam(expected)}
        />
      ),
      trend: [],
    },
    {
      label: "Nota dos clientes",
      hint: `${agent.rating.sample} ${agent.rating.sample === 1 ? "avaliação" : "avaliações"} no período`,
      figure: <Figure value={formatRating(agent.rating.value)} unit="/ 5" />,
      change: (
        <Change
          copy={changeCopy({ current: agent.rating.value, previous: team.rating, kind: "rating" })}
          suffix={versusTeam(formatRating(team.rating))}
        />
      ),
      trend: [],
    },
  ];
}

/** A person's four tiles, each compared with the team (and "sem reabrir" with the fair yardstick). */
export function PersonTiles({ agent, team }: { agent: AgentPerformance; team: TeamYardstick }) {
  return (
    <TileColumn tiles={[...personVolumeTiles(agent, team), ...personQualityTiles(agent, team)]} />
  );
}
