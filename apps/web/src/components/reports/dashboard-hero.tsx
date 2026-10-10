import type { ReactNode } from "react";

/** The page title alone, for the loading, error and first-steps states. */
export function DashboardHeader() {
  return (
    <header>
      <h1 className="text-[44px] leading-none font-semibold tracking-tight text-balance sm:text-[56px]">
        Painel de vendas
      </h1>
    </header>
  );
}

/**
 * The top of the dashboard: the title with the dates it covers, then the plain-language
 * reading of the period (profit, revenue and why). The filters live in the chart's header.
 */
export function DashboardIntro({ caption, summary }: { caption: ReactNode; summary: ReactNode }) {
  return (
    <section aria-label="Resumo do período" className="space-y-8 pb-2">
      <div className="space-y-2">
        <h1 className="text-[44px] leading-none font-semibold tracking-tight text-balance sm:text-[56px]">
          Painel de vendas
        </h1>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </div>
      {summary}
    </section>
  );
}
