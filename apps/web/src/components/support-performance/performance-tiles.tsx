import type { AgentPerformance } from "@sellbridge/shared/support-performance";
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
 * The column of tiles beside a person's chart: the same anatomy as the sales dashboard's (name, figure,
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

function TileColumn({ tiles }: { tiles: readonly StatTileProps[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
      {tiles.map((tile) => (
        <StatTile key={tile.label} {...tile} />
      ))}
    </div>
  );
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
