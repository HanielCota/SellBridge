import type { SupplierFlagReason } from "@sellbridge/shared/supplier-flags";
import {
  goldenRuleForReason,
  goldenRuleLabel,
  SUPPLIER_GOLDEN_RULES,
} from "@sellbridge/shared/supplier-golden-rules";
import { cn } from "@/lib/utils";

/**
 * The 5 "Regras de ouro", numbered, each with its line and one example. The same list the
 * supplier reads on its rules page and the team reads beside the flag form.
 */
export function GoldenRulesList({ className }: { className?: string }) {
  return (
    <ol className={cn("[&>li+li]:border-t [&>li+li]:border-border/60", className)}>
      {SUPPLIER_GOLDEN_RULES.map((rule) => (
        <li key={rule.id} className="flex gap-3 py-3">
          <span
            aria-hidden="true"
            className="w-5 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums"
          >
            {rule.number}.
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium">{rule.title}</p>
            <p className="text-sm text-muted-foreground">{rule.summary}</p>
            <p className="text-footnote text-muted-foreground">Exemplo: {rule.example}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** "Regra 2: Envie exatamente o produto anunciado" under a flag; nothing for "Outro". */
export function BrokenRuleLine({ reason }: { reason: SupplierFlagReason }) {
  const rule = goldenRuleForReason(reason);
  if (rule === null) {
    return null;
  }
  return <p className="text-footnote text-muted-foreground">{goldenRuleLabel(rule)}</p>;
}
