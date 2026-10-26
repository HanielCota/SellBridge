import type { ReactNode } from "react";

const TITLE_CLASSES = "text-2xl font-semibold tracking-tight";

interface DashboardTitleProps {
  title?: string;
  actions?: ReactNode;
}

/** The page title for loading, error and first-steps states. */
export function DashboardHeader({ title = "Visão geral", actions }: DashboardTitleProps) {
  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <h1 className={TITLE_CLASSES}>{title}</h1>
      {actions}
    </header>
  );
}

/**
 * The top of the dashboard: the title with the dates it covers, then the plain-language
 * reading of the period (profit, revenue and why). The title has the other pages' size and the
 * menu's name (board 5, approved on 2026-10-25): the reading of the period is what stands out.
 */
export function DashboardIntro({
  caption,
  summary,
  title = "Visão geral",
  actions,
}: DashboardTitleProps & { caption: ReactNode; summary: ReactNode }) {
  return (
    <section aria-label="Resumo do período" className="space-y-8 pb-2">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <h1 className={TITLE_CLASSES}>{title}</h1>
          <p className="text-sm text-muted-foreground">{caption}</p>
        </div>
        {actions}
      </div>
      {summary}
    </section>
  );
}
