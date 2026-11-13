import {
  PROBLEM_AREA_LABELS,
  PROBLEM_AREAS,
  type ProblemArea,
} from "@sellbridge/shared/problem-areas";
import {
  type ProblemPeriod,
  type ProblemSearchParams,
  type ProblemStatusFilter,
  problemSearchSchema,
} from "@sellbridge/shared/schemas";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProblemList } from "@/components/admin-problems/problem-list";
import { FilterTabs, type FilterTab } from "@/components/data/filter-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { problemListQueryOptions } from "@/features/admin-problems/problems.queries";

export const Route = createFileRoute("/_app/admin/problemas/")({
  validateSearch: problemSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps: search }) => {
    if (import.meta.env.SSR) {
      await context.queryClient.prefetchInfiniteQuery(problemListQueryOptions(search));
    }
  },
  head: () => ({ meta: [{ title: "Problemas (admin) | SellBridge" }] }),
  component: ProblemsPage,
});

const STATUS_TABS: FilterTab<ProblemStatusFilter>[] = [
  { value: "open", label: "Em aberto" },
  { value: "resolved", label: "Resolvidos" },
];

const PERIOD_TABS: FilterTab<ProblemPeriod>[] = [
  { value: "24h", label: "24 horas" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

const PERIOD_PHRASES: Record<ProblemPeriod, string> = {
  "24h": "nas últimas 24 horas",
  "7d": "nos últimos 7 dias",
  "30d": "nos últimos 30 dias",
};

const ALL_AREAS = "all";

function useUpdateSearch() {
  const navigate = useNavigate({ from: Route.fullPath });
  return (patch: Partial<ProblemSearchParams>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
}

function AreaSelect({
  value,
  onChange,
}: {
  value: ProblemArea | undefined;
  onChange: (area: ProblemArea | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="problem-area" className="shrink-0 text-sm text-muted-foreground">
        Área
      </Label>
      <Select
        value={value ?? ALL_AREAS}
        onValueChange={(next) => onChange(PROBLEM_AREAS.find((area) => area === next))}
      >
        <SelectTrigger id="problem-area" className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_AREAS}>Todas as áreas</SelectItem>
          {PROBLEM_AREAS.map((area) => (
            <SelectItem key={area} value={area}>
              {PROBLEM_AREA_LABELS[area]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ProblemsPage() {
  const search = Route.useSearch();
  const updateSearch = useUpdateSearch();
  const query = useInfiniteQuery(problemListQueryOptions(search));
  const filtered = search.area !== undefined;
  return (
    <>
      <PageHeader
        title="Problemas"
        description="Erros que o site e as tarefas em segundo plano registraram, o mais recente primeiro. Cada um some 30 dias depois da última vez que aconteceu."
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <FilterTabs
          legend="Mostrar problemas"
          tabs={STATUS_TABS}
          value={search.status}
          onChange={(status) => updateSearch({ status })}
        />
        <FilterTabs
          legend="Período"
          tabs={PERIOD_TABS}
          value={search.period}
          onChange={(period) => updateSearch({ period })}
        />
        <AreaSelect value={search.area} onChange={(area) => updateSearch({ area })} />
      </div>
      <ProblemList
        query={query}
        showingResolved={search.status === "resolved"}
        filtered={filtered}
        periodPhrase={PERIOD_PHRASES[search.period]}
        onClearFilters={() => updateSearch({ area: undefined })}
      />
    </>
  );
}
