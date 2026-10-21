import { ISSUE_SEVERITY } from "@sellbridge/shared/customer-health";
import { CUSTOMER_ISSUE_KINDS, type CustomerIssueKind } from "@sellbridge/shared/schemas";
import { Link } from "@tanstack/react-router";
import { ISSUE_ICONS, SEVERITY_TINT } from "@/components/admin/issue-style";
import type { IssueCounts } from "@/features/admin/customer-ranking";
import { ISSUE_KIND_LABELS } from "@/features/admin/issue-copy";
import { cn } from "@/lib/utils";

/**
 * One tile per kind of problem, with how many customers have it. A tile filters the table to
 * those customers and a second press clears the filter. Hovering plays the tile's mark, the
 * same one the reseller sees on their own dashboard.
 */
export function CustomerAttentionTiles({
  counts,
  active,
}: {
  counts: IssueCounts;
  active: CustomerIssueKind | undefined;
}) {
  return (
    <nav
      aria-label="Filtrar por problema"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {CUSTOMER_ISSUE_KINDS.map((kind) => {
        const Icon = ISSUE_ICONS[kind];
        const count = counts[kind];
        const isActive = active === kind;
        return (
          <Link
            key={kind}
            from="/admin/clientes/"
            to="."
            search={(previous) => ({ ...previous, issue: isActive ? undefined : kind, page: 1 })}
            replace
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "surface-interactive flex flex-col gap-3 rounded-3xl bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              isActive && "ring-2 ring-brand",
            )}
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg",
                count > 0 ? SEVERITY_TINT[ISSUE_SEVERITY[kind]] : SEVERITY_TINT.muted,
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="space-y-0.5">
              <span className="block text-2xl font-semibold tracking-tight tabular-nums">
                {count}
              </span>
              <span className="block text-footnote leading-tight text-muted-foreground">
                {ISSUE_KIND_LABELS[kind]}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
