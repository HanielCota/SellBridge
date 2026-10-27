import type { ReactNode } from "react";

const TITLE_CLASSES =
  "text-[44px] leading-none font-semibold tracking-tight text-balance sm:text-[56px]";

interface DashboardTitleProps {
  title?: string;
  actions?: ReactNode;
}

/** The page title for loading, error and first-steps states. */
export function DashboardHeader({ title = "Painel de vendas", actions }: DashboardTitleProps) {
  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <h1 className={TITLE_CLASSES}>{title}</h1>
      {actions}
    </header>
  );
}

/** The dashboard title, covered dates and plain-language reading of the period. */
export function DashboardIntro({
  caption,
  summary,
  title = "Painel de vendas",
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
