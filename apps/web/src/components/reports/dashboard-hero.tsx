import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

function DashboardActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild>
        <Link to="/catalogo">Ver catálogo</Link>
      </Button>
      <Button variant="outline" asChild>
        <Link to="/onboarding">Editar meu cadastro</Link>
      </Button>
    </div>
  );
}

/** The title and actions of a dashboard; the supplier home passes its own (item 38). */
interface DashboardTitleProps {
  title?: string;
  actions?: ReactNode;
}

/** The page title alone, for the loading, error and first-steps states. */
export function DashboardHeader({
  title = "Painel de vendas",
  actions = <DashboardActions />,
}: DashboardTitleProps) {
  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <h1 className="text-[44px] leading-none font-semibold tracking-tight text-balance sm:text-[56px]">
        {title}
      </h1>
      {actions}
    </header>
  );
}

/**
 * The top of the dashboard: the title with the dates it covers, then the plain-language
 * reading of the period (profit, revenue and why). The filters live in the chart's header.
 */
export function DashboardIntro({
  caption,
  summary,
  title = "Painel de vendas",
  actions = <DashboardActions />,
}: DashboardTitleProps & { caption: ReactNode; summary: ReactNode }) {
  return (
    <section aria-label="Resumo do período" className="space-y-8 pb-2">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <h1 className="text-[44px] leading-none font-semibold tracking-tight text-balance sm:text-[56px]">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{caption}</p>
        </div>
        {actions}
      </div>
      {summary}
    </section>
  );
}
