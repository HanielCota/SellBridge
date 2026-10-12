import {
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEPS,
  type CustomerIssue,
} from "@sellbridge/shared/customer-health";
import { CheckIcon } from "@phosphor-icons/react";
import { CustomerIssueRow } from "@/components/admin/customer-issue-row";
import { ChecklistDoneIcon } from "@/components/reports/attention-icons";
import { cn } from "@/lib/utils";

/** Small heading over one part of a customer's summary. */
export function SectionLabel({ children }: { children: string }) {
  return <h3 className="mb-2 text-footnote font-medium text-muted-foreground">{children}</h3>;
}

function AllClear() {
  return (
    <div className="flex items-center gap-3 px-2 py-2.5">
      <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
        <ChecklistDoneIcon className="size-5 text-emerald-600 dark:text-emerald-400" />
      </span>
      <p className="text-footnote text-muted-foreground">
        <span className="block text-sm font-medium text-foreground">Tudo em dia</span>
        Nenhuma pendência para este cliente.
      </p>
    </div>
  );
}

/** What needs doing for the customer, each with the button that does it, or an all-clear. */
export function CustomerIssueList({
  customer,
  issues,
}: {
  customer: { id: string; email: string; banned: boolean };
  issues: readonly CustomerIssue[];
}) {
  if (issues.length === 0) {
    return <AllClear />;
  }
  return (
    <ul className="-mx-2 space-y-1">
      {issues.map((issue) => (
        <CustomerIssueRow key={issue.kind} customer={customer} issue={issue} />
      ))}
    </ul>
  );
}

export function OnboardingProgress({ completed }: { completed: number }) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {ONBOARDING_STEPS.map((step, index) => {
        const done = index < completed;
        return (
          <li key={step} className="space-y-1.5">
            <span
              className={cn(
                "block h-1.5 rounded-full transition-colors duration-500",
                done ? "bg-brand" : "bg-muted",
              )}
            />
            <span
              className={cn(
                "flex items-center gap-1 text-footnote",
                done ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {done ? <CheckIcon weight="bold" className="size-3 text-brand-text" /> : null}
              {ONBOARDING_STEP_LABELS[step]}
              <span className="sr-only">{done ? ", concluído" : ", pendente"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Orders per week as a filled line, kept clear of the edges so no stroke is ever clipped. */
function OrdersSparkline({ weeks, className }: { weeks: readonly number[]; className: string }) {
  const width = 240;
  const height = 56;
  const padding = 6;
  const peak = Math.max(...weeks, 1);
  const points = weeks.map((orders, index) => {
    const left = padding + (index * (width - padding * 2)) / Math.max(weeks.length - 1, 1);
    const top = height - padding - (orders / peak) * (height - padding * 2);
    return `${left.toFixed(1)},${top.toFixed(1)}`;
  });
  const baseline = height - padding;
  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className={cn("w-full text-chart-brand", className)}
      >
        <polygon
          points={`${padding},${baseline} ${points.join(" ")} ${width - padding},${baseline}`}
          fill="currentColor"
          fillOpacity={0.14}
        />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="sr-only">
        Pedidos nas últimas {weeks.length} semanas, da mais antiga à atual: {weeks.join(", ")}
      </figcaption>
    </figure>
  );
}

export function WeeklyOrders({
  weeks,
  className = "h-14",
}: {
  weeks: readonly number[];
  /** Height of the chart and of the empty note that stands in for it. */
  className?: string;
}) {
  if (weeks.every((orders) => orders === 0)) {
    return (
      <p
        className={cn(
          "flex items-center justify-center rounded-xl bg-muted text-footnote text-muted-foreground",
          className,
        )}
      >
        Nenhum pedido nas últimas {weeks.length} semanas
      </p>
    );
  }
  return <OrdersSparkline weeks={weeks} className={className} />;
}
