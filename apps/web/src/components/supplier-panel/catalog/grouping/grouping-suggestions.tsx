import { ArrowLeftIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supplierPanelCatalogKey } from "@/features/supplier-panel/catalog/catalog.queries";
import {
  supplierPanelSeparateModel,
  type supplierPanelGetGroupingSuggestions,
} from "@/features/supplier-panel/catalog/grouping/grouping.functions";
import { supplierPanelGroupingSuggestionsQueryOptions } from "@/features/supplier-panel/catalog/grouping/grouping.queries";
import { errorMessage } from "@/lib/errors";
import { GroupingCard, type GroupedResult } from "./grouping-card";

const PAGE_SIZE = 10;
const UNDO_SECONDS = 10;
const MILLISECONDS_PER_SECOND = 1000;

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-3 w-fit" onClick={onBack}>
      <ArrowLeftIcon aria-hidden="true" />
      Produtos
    </Button>
  );
}

/** Undo right after grouping: the same separation the grid form offers, at once. */
function useGroupingUndo(supplierId: string) {
  const queryClient = useQueryClient();
  const separate = useMutation({
    mutationFn: async (modelId: string) =>
      await supplierPanelSeparateModel({ data: { supplierId, modelId } }),
    onSuccess: async (result) => {
      toast.success(`${result.products} produtos separados de novo, como estavam antes.`);
      await queryClient.invalidateQueries({ queryKey: supplierPanelCatalogKey(supplierId) });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
  return async (result: GroupedResult) => {
    toast.success(`${result.products} produtos juntados em ${result.modelTitle}`, {
      description: "Na sua lista, eles agora aparecem como um produto só.",
      duration: UNDO_SECONDS * MILLISECONDS_PER_SECOND,
      action: { label: "Desfazer", onClick: () => separate.mutate(result.modelId) },
    });
    await queryClient.invalidateQueries({ queryKey: supplierPanelCatalogKey(supplierId) });
  };
}

function NoSuggestions({ onBack }: { onBack: () => void }) {
  return (
    <EmptyState
      icon={SquaresFourIcon}
      title="Nenhuma sugestão agora"
      description="Aqui aparecem produtos com o mesmo nome em cores e tamanhos diferentes, como “Tênis Casual - Preto 38” e “Tênis Casual - Preto 39”."
      action={
        <Button variant="outline" onClick={onBack}>
          Voltar para os produtos
        </Button>
      }
    />
  );
}

function SuggestionList({
  supplierId,
  suggestions,
}: {
  supplierId: string;
  suggestions: Parameters<typeof GroupingCard>[0]["suggestion"][];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const announceGrouped = useGroupingUndo(supplierId);
  const openKey = expanded ?? suggestions[0]?.key ?? null;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {suggestions.length === 1
          ? "1 sugestão. Confira e junte uma de cada vez."
          : `${suggestions.length} sugestões. Confira e junte uma de cada vez.`}
      </p>
      <ul className="grid gap-4">
        {suggestions.slice(0, shown).map((suggestion) => (
          <GroupingCard
            key={suggestion.key}
            supplierId={supplierId}
            suggestion={suggestion}
            expanded={suggestion.key === openKey}
            onExpand={() => setExpanded(suggestion.key)}
            onGrouped={(result) => {
              setExpanded(null);
              void announceGrouped(result);
            }}
          />
        ))}
      </ul>
      {suggestions.length > shown ? (
        <Button
          variant="outline"
          className="min-h-11 justify-self-center"
          onClick={() => setShown((current) => current + PAGE_SIZE)}
        >
          Mostrar mais {Math.min(PAGE_SIZE, suggestions.length - shown)} sugestões
        </Button>
      ) : null}
    </div>
  );
}

function SuggestionsBody({
  supplierId,
  query,
  onBack,
}: {
  supplierId: string;
  query: UseQueryResult<Awaited<ReturnType<typeof supplierPanelGetGroupingSuggestions>>>;
  onBack: () => void;
}) {
  if (query.isPending) {
    return <Skeleton className="h-96 rounded-3xl" aria-label="Carregando sugestões" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (!query.data.available || query.data.suggestions.length === 0) {
    return <NoSuggestions onBack={onBack} />;
  }
  return <SuggestionList supplierId={supplierId} suggestions={[...query.data.suggestions]} />;
}

/**
 * "Sugestões de grade": products the supplier already has that look like one product in colours
 * and sizes. Nothing is grouped until the supplier checks a suggestion and confirms it.
 */
export function GroupingSuggestions({
  supplierId,
  onBack,
}: {
  supplierId: string;
  onBack: () => void;
}) {
  const query = useQuery(supplierPanelGroupingSuggestionsQueryOptions(supplierId));
  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackButton onBack={onBack} />}
        title="Sugestões de grade"
        description="Produtos com o mesmo nome em cores e tamanhos diferentes podem virar um produto só. Nada é juntado sem você confirmar."
      />
      <SuggestionsBody supplierId={supplierId} query={query} onBack={onBack} />
    </div>
  );
}
