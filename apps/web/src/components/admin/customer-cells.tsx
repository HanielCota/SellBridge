import {
  healthLevel,
  ISSUE_SEVERITY,
  ONBOARDING_STEPS,
  type HealthLevel,
} from "@sellbridge/shared/customer-health";
import { CheckCircleIcon, LockSimpleIcon } from "@phosphor-icons/react";
import type { ReactElement } from "react";
import { HealthRing } from "@/components/admin/health-ring";
import { SEVERITY_BADGE } from "@/components/admin/issue-style";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { Badge } from "@/components/ui/badge";
import { HintedText } from "@/components/ui/hint";
import type { RankedCustomer } from "@/features/admin/customer-ranking";
import { describeIssue } from "@/features/admin/issue-copy";
import { cn } from "@/lib/utils";

/** Chips shown per row before the rest collapse into "+N". */
const VISIBLE_ISSUE_BADGES = 2;

const LEVEL_WORDS: Record<HealthLevel, string> = {
  critical: "crítico",
  attention: "atenção",
  healthy: "bem",
};

/** Who the customer sells, from the suppliers of their shops; pending shops are flagged. */
export function supplierSummary(customer: RankedCustomer): { text: string; pending: number } {
  const names = [
    ...new Set(
      customer.stores.flatMap((store) => (store.supplierName === null ? [] : [store.supplierName])),
    ),
  ];
  const pending = customer.stores.filter((store) => store.supplierName === null).length;
  if (customer.stores.length === 0) {
    return { text: "Sem loja", pending };
  }
  return { text: names.length > 0 ? names.join(", ") : "Sem fornecedor", pending };
}

/** The ring plus, on hover or tap, its band in words (admin section 1a). */
export function CustomerScore({ score }: { score: number | null }) {
  const ring = <HealthRing score={score} size="sm" />;
  if (score === null) {
    return ring;
  }
  const label = `Nota ${score}: ${LEVEL_WORDS[healthLevel(score)]} (abaixo de 40 é crítico; de 70 para cima, bem)`;
  return (
    <HintedText label={label} className="inline-flex rounded-full">
      {ring}
    </HintedText>
  );
}

export function CustomerStores({ customer }: { customer: RankedCustomer }) {
  const summary = supplierSummary(customer);
  return (
    <div className="flex items-center gap-2">
      {customer.stores.length > 0 ? (
        <span className="flex gap-1">
          {customer.stores.map((store) => {
            const broken = store.status === "expired" || store.status === "error";
            return (
              <HintedText
                key={`${store.marketplace}-${store.shopName}`}
                label={`${store.shopName}${broken ? " (desconectada)" : ""}`}
                focusable={false}
                className="relative"
              >
                <MarketplaceMark marketplace={store.marketplace} className="size-6 rounded-lg" />
                {broken ? (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive ring-2 ring-card" />
                ) : null}
              </HintedText>
            );
          })}
        </span>
      ) : null}
      <span className="min-w-0 space-y-0.5 text-footnote">
        <span
          className={cn(
            "block max-w-56 truncate",
            customer.stores.length === 0 && "text-muted-foreground",
          )}
          title={summary.text}
        >
          {summary.text}
        </span>
        {summary.pending > 0 ? (
          <span className="block font-medium text-amber-700 dark:text-amber-400">
            {summary.pending === 1
              ? "1 loja sem fornecedor"
              : `${summary.pending} lojas sem fornecedor`}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** A chip's legend, left out inside a link (the phone row), where a tap opens the customer. */
function ChipHint({
  label,
  withHints,
  children,
}: {
  label: string;
  withHints: boolean;
  children: ReactElement;
}) {
  if (!withHints) {
    return children;
  }
  return (
    <HintedText label={label} className="inline-flex rounded-full">
      {children}
    </HintedText>
  );
}

export function CustomerHealthBadges({
  customer,
  withHints = true,
}: {
  customer: RankedCustomer;
  withHints?: boolean;
}) {
  if (customer.banned) {
    return (
      <Badge variant="destructive">
        <LockSimpleIcon weight="fill" />
        Bloqueado
      </Badge>
    );
  }
  const { issues, completedSteps, nextStep } = customer.health;
  if (issues.length === 0 && nextStep) {
    return (
      <ChipHint label={TERM_HINTS.onboardingSteps} withHints={withHints}>
        <Badge variant="secondary">
          Primeiros passos {completedSteps}/{ONBOARDING_STEPS.length}
        </Badge>
      </ChipHint>
    );
  }
  if (issues.length === 0) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
        <CheckCircleIcon weight="fill" />
        Tudo em dia
      </Badge>
    );
  }
  const hidden = issues.length - VISIBLE_ISSUE_BADGES;
  return (
    <span className="flex flex-wrap gap-1">
      {issues.slice(0, VISIBLE_ISSUE_BADGES).map((issue) => {
        const copy = describeIssue(issue);
        return (
          <ChipHint key={issue.kind} label={copy.description} withHints={withHints}>
            <Badge className={SEVERITY_BADGE[ISSUE_SEVERITY[issue.kind]]}>{copy.badge}</Badge>
          </ChipHint>
        );
      })}
      {hidden > 0 ? <Badge variant="secondary">+{hidden}</Badge> : null}
    </span>
  );
}
