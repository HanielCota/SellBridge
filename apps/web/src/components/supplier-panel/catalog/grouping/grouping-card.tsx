import type {
  GroupingSuggestionProduct,
  GroupingSuggestionView,
} from "@sellbridge/database/repositories";
import { MAX_MODEL_TITLE_LENGTH } from "@sellbridge/shared/product-grid";
import {
  canGroup,
  groupingSummary,
  type GroupingProblems,
} from "@sellbridge/shared/product-grouping";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ProductVisual } from "@/components/catalog/product-visual";
import { TextField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import {
  checkedProducts,
  draftProblems,
  groupingConsequence,
  groupingInput,
  initialDraft,
  type DraftProduct,
  type GroupingDraft,
} from "@/features/supplier-panel/catalog/grouping/grouping-card";
import { supplierPanelGroupProducts } from "@/features/supplier-panel/catalog/grouping/grouping.functions";
import { errorMessage } from "@/lib/errors";
import { GroupingProductRow, ProblemList } from "./grouping-product-row";

export interface GroupedResult {
  readonly modelId: string;
  readonly modelTitle: string;
  readonly products: number;
}

const UNREAD_GROUP = "Confira a cor e o tamanho";

/** Colour by colour, as the products were read from their names; unread ones last. */
function byColor(products: readonly GroupingSuggestionProduct[]) {
  const groups = new Map<string, GroupingSuggestionProduct[]>();
  for (const product of products) {
    const title = product.color ?? UNREAD_GROUP;
    const group = groups.get(title);
    if (group === undefined) {
      groups.set(title, [product]);
      continue;
    }
    group.push(product);
  }
  return [...groups.entries()].map(([title, entries]) => ({ title, entries }));
}

function mergedProblems(
  draft: GroupingProblems,
  server: GroupingProblems | null,
): GroupingProblems {
  if (server === null) {
    return draft;
  }
  const byProduct: Record<string, readonly string[]> = { ...draft.byProduct };
  for (const [productId, problems] of Object.entries(server.byProduct)) {
    byProduct[productId] = [...(byProduct[productId] ?? []), ...problems];
  }
  return { general: [...draft.general, ...server.general], byProduct };
}

function CardHeading({
  suggestion,
  draft,
  summary,
}: {
  suggestion: GroupingSuggestionView;
  draft: GroupingDraft;
  summary: string;
}) {
  const main = suggestion.products.find((product) => product.id === draft.mainProductId);
  return (
    <div className="flex items-center gap-3">
      <ProductVisual
        imageUrl={main?.imageUrl ?? suggestion.products[0]?.imageUrl ?? null}
        title={draft.modelTitle}
        categoryName={null}
        compact
        className="size-16 shrink-0 rounded-xl"
      />
      <div className="min-w-0 space-y-1">
        <h2 className="text-headline font-semibold break-words">{draft.modelTitle}</h2>
        <p className="text-sm text-muted-foreground">{summary}</p>
      </div>
    </div>
  );
}

/** A suggestion not being checked yet: its name, what it becomes and the way to check it. */
function CollapsedCard({
  suggestion,
  onExpand,
}: {
  suggestion: GroupingSuggestionView;
  onExpand: () => void;
}) {
  const draft = initialDraft(suggestion);
  return (
    <li className="surface-card flex flex-col gap-4 rounded-3xl bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <CardHeading
        suggestion={suggestion}
        draft={draft}
        summary={groupingSummary(suggestion.products)}
      />
      <Button variant="outline" className="min-h-11 shrink-0" onClick={onExpand}>
        Conferir esta sugestão
      </Button>
    </li>
  );
}

function ConfirmFooter({
  count,
  consequence,
  problems,
  isPending,
  error,
  onConfirm,
}: {
  count: number;
  consequence: readonly string[];
  problems: GroupingProblems;
  isPending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const ready = canGroup(problems);
  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <ProblemList problems={problems.general} />
      <p className="text-sm text-pretty">{consequence.join(" ")}</p>
      {error === null ? null : (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:items-center sm:gap-4">
        <Button
          className="min-h-11 w-full sm:w-auto"
          disabled={!ready || isPending}
          onClick={onConfirm}
        >
          {isPending ? "Juntando..." : `Juntar ${count} produtos`}
        </Button>
        {ready ? null : (
          <p className="text-footnote text-muted-foreground">
            Corrija os avisos em vermelho para juntar.
          </p>
        )}
      </div>
    </div>
  );
}

function useDraft(suggestion: GroupingSuggestionView) {
  const [draft, setDraft] = useState(() => initialDraft(suggestion));
  const [serverProblems, setServerProblems] = useState<GroupingProblems | null>(null);
  const change = (next: GroupingDraft) => {
    setDraft(next);
    setServerProblems(null);
  };
  const changeProduct = (productId: string, patch: Partial<DraftProduct>) => {
    const current = draft.products[productId];
    if (current === undefined) {
      return;
    }
    change({ ...draft, products: { ...draft.products, [productId]: { ...current, ...patch } } });
  };
  return { draft, serverProblems, setServerProblems, change, changeProduct };
}

function ProductSections({
  suggestion,
  draft,
  problems,
  onChangeProduct,
  onChooseMain,
}: {
  suggestion: GroupingSuggestionView;
  draft: GroupingDraft;
  problems: GroupingProblems;
  onChangeProduct: (productId: string, patch: Partial<DraftProduct>) => void;
  onChooseMain: (productId: string) => void;
}) {
  return byColor(suggestion.products).map((group) => (
    <section key={group.title} className="grid gap-2" aria-label={group.title}>
      <h3 className="text-subhead font-semibold">{group.title}</h3>
      <ul className="grid gap-2">
        {group.entries.map((product) => (
          <GroupingProductRow
            key={product.id}
            product={product}
            draft={draft.products[product.id] ?? { checked: false, color: "", size: "" }}
            isMain={draft.mainProductId === product.id}
            problems={problems.byProduct[product.id] ?? []}
            radioGroup={`grouping-main-${suggestion.mainProductId}`}
            onChange={(patch) => onChangeProduct(product.id, patch)}
            onChooseMain={() => onChooseMain(product.id)}
          />
        ))}
      </ul>
    </section>
  ));
}

function useGroupMutation(input: {
  supplierId: string;
  suggestion: GroupingSuggestionView;
  draft: GroupingDraft;
  onRefused: (problems: GroupingProblems) => void;
  onGrouped: (result: GroupedResult) => void;
}) {
  const { supplierId, suggestion, draft } = input;
  return useMutation({
    mutationFn: async () =>
      await supplierPanelGroupProducts({ data: groupingInput(supplierId, suggestion, draft) }),
    onSuccess: (result) => {
      if (!result.grouped) {
        input.onRefused(result.problems);
        return;
      }
      input.onGrouped({
        modelId: result.modelId,
        modelTitle: draft.modelTitle.trim(),
        products: checkedProducts(suggestion, draft).length,
      });
    },
  });
}

/** The suggestion being checked: name, products, colour and size, and the confirmation. */
function ExpandedCard({
  supplierId,
  suggestion,
  onGrouped,
}: {
  supplierId: string;
  suggestion: GroupingSuggestionView;
  onGrouped: (result: GroupedResult) => void;
}) {
  const { draft, serverProblems, setServerProblems, change, changeProduct } = useDraft(suggestion);
  const checked = checkedProducts(suggestion, draft);
  const problems = mergedProblems(draftProblems(suggestion, draft), serverProblems);
  const mutation = useGroupMutation({
    supplierId,
    suggestion,
    draft,
    onRefused: setServerProblems,
    onGrouped,
  });
  return (
    <li className="surface-card grid gap-5 rounded-3xl bg-card p-4 sm:p-6">
      <CardHeading suggestion={suggestion} draft={draft} summary={groupingSummary(checked)} />
      <TextField
        id={`grouping-${suggestion.mainProductId}-title`}
        label="Nome do produto com cores e tamanhos"
        value={draft.modelTitle}
        errors={[]}
        maxLength={MAX_MODEL_TITLE_LENGTH}
        onValueChange={(modelTitle) => change({ ...draft, modelTitle })}
      />
      <ProductSections
        suggestion={suggestion}
        draft={draft}
        problems={problems}
        onChangeProduct={changeProduct}
        onChooseMain={(mainProductId) => change({ ...draft, mainProductId })}
      />
      <ConfirmFooter
        count={checked.length}
        consequence={groupingConsequence(checked)}
        problems={problems}
        isPending={mutation.isPending}
        error={mutation.isError ? errorMessage(mutation.error) : null}
        onConfirm={() => mutation.mutate()}
      />
    </li>
  );
}

/**
 * One suggestion: collapsed to its name and what it becomes, or open for the supplier to check
 * every product before grouping. Only the open one carries the colored button.
 */
export function GroupingCard({
  supplierId,
  suggestion,
  expanded,
  onExpand,
  onGrouped,
}: {
  supplierId: string;
  suggestion: GroupingSuggestionView;
  expanded: boolean;
  onExpand: () => void;
  onGrouped: (result: GroupedResult) => void;
}) {
  if (!expanded) {
    return <CollapsedCard suggestion={suggestion} onExpand={onExpand} />;
  }
  return <ExpandedCard supplierId={supplierId} suggestion={suggestion} onGrouped={onGrouped} />;
}
