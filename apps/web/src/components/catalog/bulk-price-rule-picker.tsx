import type { SellableCatalogProduct } from "@sellbridge/database/repositories";
import { MAX_MARKUP_PERCENT, MIN_MARKUP_PERCENT, type PriceRule } from "@sellbridge/shared/schemas";
import { MinusIcon, PlusIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  MARKUP_RANGE_MESSAGE,
  parseMarkupPercent,
  type usePriceOverrides,
  type usePriceRuleDraft,
} from "@/features/catalog/use-price-rule-draft";
import { cn } from "@/lib/utils";
import { SettingsGroup } from "./bulk-publish-parts";
import { PriceReceipt } from "./price-receipt";

const MARKUP_STEP = 5;

const RULE_OPTIONS: { kind: PriceRule["kind"]; label: string }[] = [
  { kind: "markup", label: "Custo + margem" },
  { kind: "suggested", label: "Sugerido pelo fornecedor" },
];

/** Segmented control cut out of a muted track, like the period filter. */
function RuleSegments({
  kind,
  onKindChange,
}: {
  kind: PriceRule["kind"];
  onKindChange: (kind: PriceRule["kind"]) => void;
}) {
  return (
    <div className="p-2">
      <div className="flex h-9 items-center gap-0.5 rounded-full bg-muted p-1">
        {RULE_OPTIONS.map((option) => (
          <label
            key={option.kind}
            className={cn(
              "flex h-7 flex-1 cursor-pointer items-center justify-center rounded-full px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-[background-color,color,box-shadow] duration-150 hover:text-foreground",
              "has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-checked:ring-1 has-checked:ring-border",
              "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
            )}
          >
            <input
              type="radio"
              name="price-rule"
              checked={kind === option.kind}
              onChange={() => onKindChange(option.kind)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function clampMarkup(percent: number): number {
  return Math.min(MAX_MARKUP_PERCENT, Math.max(MIN_MARKUP_PERCENT, percent));
}

/**
 * Minus, typed percentage and plus in one pill, stepping by 5 within the allowed range. The
 * buttons are named after `stepNoun`, not `label`, so a label lookup finds only the input.
 */
function PercentStepper({
  label,
  stepNoun,
  percent,
  onPercentChange,
}: {
  label: string;
  stepNoun: string;
  percent: string;
  onPercentChange: (percent: string) => void;
}) {
  const current = Number.parseInt(percent, 10) || 0;
  const step = (delta: number) => onPercentChange(String(clampMarkup(current + delta)));
  return (
    <div className="flex shrink-0 items-center rounded-full bg-muted p-0.5">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Diminuir ${stepNoun}`}
        disabled={current <= MIN_MARKUP_PERCENT}
        onClick={() => step(-MARKUP_STEP)}
      >
        <MinusIcon aria-hidden="true" />
      </Button>
      <span className="flex items-center rounded-md text-sm font-medium tabular-nums has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
        <input
          aria-label={label}
          inputMode="numeric"
          value={percent}
          onChange={(event) => onPercentChange(event.target.value.replace(/\D/g, ""))}
          // 17px on phones: iOS zooms into any field under 16px when it gets focus.
          className="w-9 rounded-md bg-transparent text-right text-body outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-8 sm:text-sm"
        />
        %
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Aumentar ${stepNoun}`}
        disabled={current >= MAX_MARKUP_PERCENT}
        onClick={() => step(MARKUP_STEP)}
      >
        <PlusIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function MarkupStepper({
  percent,
  onPercentChange,
  percentValid,
  hint,
}: {
  percent: string;
  onPercentChange: (percent: string) => void;
  percentValid: boolean;
  hint: string;
}) {
  return (
    <div className="space-y-1 px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm">Acréscimo sobre o custo</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <PercentStepper
          label="Acréscimo sobre o custo"
          stepNoun="acréscimo"
          percent={percent}
          onPercentChange={onPercentChange}
        />
      </div>
      {percentValid ? null : <p className="text-xs text-destructive">{MARKUP_RANGE_MESSAGE}</p>}
    </div>
  );
}

/**
 * Lets the product on screen leave the shared markup. Collapsed it is one quiet link; once
 * used it shows its own stepper and the shared value it replaced.
 */
function ProductMarkupAdjust({
  sharedPercent,
  percent,
  onPercentChange,
  onReset,
}: {
  sharedPercent: string;
  percent: string | undefined;
  onPercentChange: (percent: string) => void;
  onReset: () => void;
}) {
  if (percent === undefined) {
    return (
      <button
        type="button"
        onClick={() => onPercentChange(sharedPercent)}
        className="flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <SlidersHorizontalIcon className="size-3.5" aria-hidden="true" />
        Usar outra margem neste produto
      </button>
    );
  }
  const valid = parseMarkupPercent(percent) !== null;
  return (
    <div className="space-y-1 rounded-xl bg-background/60 px-3 py-2 ring-1 ring-border">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm">Margem deste produto</p>
          <p className="text-xs text-muted-foreground">
            Padrão {sharedPercent}% ·{" "}
            <button
              type="button"
              onClick={onReset}
              className="rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Voltar ao padrão
            </button>
          </p>
        </div>
        <PercentStepper
          label="Acréscimo deste produto"
          stepNoun="margem do produto"
          percent={percent}
          onPercentChange={onPercentChange}
        />
      </div>
      {valid ? null : <p className="text-xs text-destructive">{MARKUP_RANGE_MESSAGE}</p>}
    </div>
  );
}

/** "Arredondado para ,90", or how many products still follow the shared markup. */
function markupHint(total: number, adjusted: number): string {
  if (adjusted === 0) {
    return "Arredondado para ,90";
  }
  return `Vale para ${total - adjusted} de ${total} · arredondado para ,90`;
}

export function PriceRulePicker({
  products,
  draft,
  overrides,
}: {
  products: SellableCatalogProduct[];
  draft: ReturnType<typeof usePriceRuleDraft>;
  overrides: ReturnType<typeof usePriceOverrides>;
}) {
  const isMarkup = draft.kind === "markup";
  const ruleFor = (product: SellableCatalogProduct) =>
    (isMarkup ? overrides.rules[product.id] : undefined) ?? draft.rule;
  // The markup the preview really applies: a half-typed shared value falls back to the default.
  const sharedPercent = draft.rule.kind === "markup" ? String(draft.rule.percent) : draft.percent;
  const adjust = (product: SellableCatalogProduct) => (
    <ProductMarkupAdjust
      sharedPercent={sharedPercent}
      percent={overrides.percentFor(product.id)}
      onPercentChange={(percent) => overrides.setPercent(product.id, percent)}
      onReset={() => overrides.clear(product.id)}
    />
  );
  return (
    <SettingsGroup title="Preço de venda">
      <RuleSegments kind={draft.kind} onKindChange={draft.setKind} />
      {isMarkup ? (
        <MarkupStepper
          percent={draft.percent}
          onPercentChange={draft.setPercent}
          percentValid={draft.percentValid}
          hint={markupHint(products.length, overrides.count)}
        />
      ) : null}
      <PriceReceipt
        products={products}
        ruleFor={ruleFor}
        adjust={isMarkup && products.length > 1 ? adjust : undefined}
      />
    </SettingsGroup>
  );
}
