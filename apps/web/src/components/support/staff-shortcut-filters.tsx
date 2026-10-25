import { NO_SITUATION_FILTER, type StaffTicketsSearch } from "@sellbridge/shared/schemas";
import { SUPPORT_TOPICS } from "@sellbridge/shared/support-topics";
import { useQuery } from "@tanstack/react-query";
import { XIcon } from "@phosphor-icons/react";
import { supportTeamQueryOptions } from "@/features/support/support.queries";

/*
 * The filters the performance screen opens the queue with (a person, a subject, a kind of
 * customer). They have no control of their own in the toolbar, so they show as removable chips.
 */

const ORIGIN_CHIPS = { revendedor: "Revendedores", fornecedor: "Fornecedores" } as const;

/** The situation's name from any topic, so it still reads right if the topic filter changes. */
function situationLabel(situationId: string): string {
  if (situationId === NO_SITUATION_FILTER) {
    return "Sem detalhe";
  }
  const situation = Object.values(SUPPORT_TOPICS)
    .flatMap((topics) => topics.flatMap((topic) => topic.situations))
    .find((candidate) => candidate.id === situationId);
  return situation?.label ?? "Situação escolhida";
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Tirar o filtro ${label}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted py-1 pr-2 pl-3 text-xs font-medium text-foreground outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97]"
    >
      {label}
      <XIcon aria-hidden="true" className="size-3" weight="bold" />
    </button>
  );
}

export function StaffShortcutFilters({
  search,
  onChange,
}: {
  search: StaffTicketsSearch;
  onChange: (patch: Partial<StaffTicketsSearch>) => void;
}) {
  const team = useQuery({
    ...supportTeamQueryOptions(),
    enabled: search.responsavel !== undefined,
  });
  if (
    search.responsavel === undefined &&
    search.situacao === undefined &&
    search.origem === undefined
  ) {
    return null;
  }
  const person =
    team.data?.find((member) => member.id === search.responsavel)?.name ?? "Pessoa da equipe";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      Filtrando por
      {search.responsavel === undefined ? null : (
        <Chip label={person} onRemove={() => onChange({ responsavel: undefined })} />
      )}
      {search.situacao === undefined ? null : (
        <Chip
          label={situationLabel(search.situacao)}
          onRemove={() => onChange({ situacao: undefined })}
        />
      )}
      {search.origem === undefined ? null : (
        <Chip
          label={ORIGIN_CHIPS[search.origem]}
          onRemove={() => onChange({ origem: undefined })}
        />
      )}
    </div>
  );
}
