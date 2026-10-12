import { ISSUE_SEVERITY, type CustomerIssue } from "@sellbridge/shared/customer-health";
import type { ReactNode } from "react";
import { CustomerIssueAction } from "@/components/admin/customer-issue-action";
import { ISSUE_ICONS, SEVERITY_TINT } from "@/components/admin/issue-style";
import { describeIssue } from "@/features/admin/issue-copy";
import { cn } from "@/lib/utils";

/**
 * One problem as a row of the "Precisa de você" kind: its animated mark, what is wrong, and
 * the button that fixes it. Hovering anywhere on the row plays the mark.
 */
export function CustomerIssueRow({
  customer,
  issue,
  context,
  controls,
}: {
  customer: { id: string; email: string; banned: boolean };
  issue: CustomerIssue;
  /** Extra line under the description, e.g. whose problem it is in the shared queue. */
  context?: ReactNode;
  /** Extra buttons before the main action, e.g. taking or snoozing it in the queue. */
  controls?: ReactNode;
}) {
  const Icon = ISSUE_ICONS[issue.kind];
  const copy = describeIssue(issue);
  return (
    <li
      data-glyph-trigger
      className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 hover:row-lift"
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          SEVERITY_TINT[ISSUE_SEVERITY[issue.kind]],
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="text-footnote text-muted-foreground">{copy.description}</p>
        {context ? (
          <div className="mt-0.5 text-footnote text-muted-foreground">{context}</div>
        ) : null}
      </div>
      {controls}
      <CustomerIssueAction customer={customer} issue={issue} />
    </li>
  );
}
