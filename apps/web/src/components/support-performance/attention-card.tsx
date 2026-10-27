import type { SupportPerformanceReport } from "@sellbridge/shared/support-performance";
import { Link } from "@tanstack/react-router";
import {
  CaretRightIcon,
  ClockCountdownIcon,
  LifebuoyIcon,
  ListPlusIcon,
  TrayIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import { ChecklistDoneIcon } from "@/components/reports/attention-icons";
import { attentionCopy, type AttentionTone } from "@/features/support/performance-story";
import { cn } from "@/lib/utils";
import { CARD_ROWS, type MoreLink, OverviewCard } from "./overview-card";

const TONE_CLASSES: Record<AttentionTone, string> = {
  danger: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  review: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const ATTENTION_ICONS = {
  overdue: ClockCountdownIcon,
  rising_subject: TrendUpIcon,
  needs_support: LifebuoyIcon,
  unassigned: TrayIcon,
  open_ended: ListPlusIcon,
} as const;

function AllClear() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
        <ChecklistDoneIcon className="size-6 text-emerald-600 dark:text-emerald-400" />
      </span>
      <p className="max-w-60 text-sm text-muted-foreground">
        <span className="block text-subhead font-medium text-foreground">Tudo em dia</span>
        Nada atrasado, sem responsável ou fora do comum.
      </p>
    </div>
  );
}

/** What only the coordination can act on, most urgent first; the sales dashboard's pattern. */
export function AttentionCard({ report }: { report: SupportPerformanceReport }) {
  const more: MoreLink | null =
    report.attention.length > CARD_ROWS
      ? { label: "Ver tudo na fila", to: "/admin/chamados" }
      : null;
  return (
    <OverviewCard id="support-attention-title" title="Precisa de você" more={more}>
      {report.attention.length === 0 ? (
        <AllClear />
      ) : (
        <ul className="-mx-2 -mt-1 space-y-1">
          {report.attention.slice(0, CARD_ROWS).map((item) => {
            const copy = attentionCopy(item, { period: report.period, origin: report.origin });
            const Icon = ATTENTION_ICONS[item.kind];
            return (
              <li key={copy.key}>
                <Link
                  to={copy.link.to}
                  search={copy.link.search}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-[background-color,box-shadow] duration-100 outline-none hover:row-lift focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      TONE_CLASSES[copy.tone],
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium">{copy.title}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {copy.description}
                    </span>
                  </span>
                  <CaretRightIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </OverviewCard>
  );
}
