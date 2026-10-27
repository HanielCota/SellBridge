import { CaretDownIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { ReportCase, ReportCaseTab, ReportRule } from "@/features/report-kit/report-model";
import { cn } from "@/lib/utils";
import { ReportCard } from "./report-card";

/**
 * A case link may carry a query ("?query=MOCK-ORD-1"). Handing it whole to `to` glued the
 * profile param onto the query value, so the target was not found: path and search go apart.
 */
function splitHref(href: string): { to: string; search: Record<string, string> } {
  const url = new URL(href, "http://report.local");
  return { to: url.pathname, search: Object.fromEntries(url.searchParams) };
}

function CaseItem({ item }: { item: ReportCase }) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-border py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        <p className="text-sm text-muted-foreground">{item.detail}</p>
        {item.meta ? (
          <p className="text-xs text-muted-foreground tabular-nums">{item.meta}</p>
        ) : null}
      </div>
      {item.href ? (
        <Link
          {...splitHref(item.href)}
          className="flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-brand-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 print:hidden"
        >
          Ver item
        </Link>
      ) : null}
    </li>
  );
}

function CaseList({ tab }: { tab: ReportCaseTab }) {
  if (tab.items.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">Nenhum caso neste período.</p>;
  }
  return (
    <>
      <ul>
        {tab.items.map((item) => (
          <CaseItem key={item.id} item={item} />
        ))}
      </ul>
      {tab.more > 0 ? (
        <p className="pt-2 text-footnote text-muted-foreground">Mais {tab.more} na planilha.</p>
      ) : null}
    </>
  );
}

/**
 * Tabs on screen; on paper every list prints, one under the other, each with its title.
 */
export function ReportCases({ tabs }: { tabs: readonly ReportCaseTab[] }) {
  const [current, setCurrent] = useState(tabs[0]?.key ?? "");
  if (tabs.length === 0) {
    return null;
  }
  return (
    <ReportCard
      title="Casos pra olhar"
      note="Os itens que pedem uma ação, com o link para cada um."
    >
      <div
        role="tablist"
        aria-label="Tipos de caso"
        className="mb-3 flex flex-wrap gap-1.5 print:hidden"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`report-tab-${tab.key}`}
            aria-selected={tab.key === current}
            aria-controls={`report-panel-${tab.key}`}
            onClick={() => setCurrent(tab.key)}
            className="flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-selected:border-foreground aria-selected:bg-foreground aria-selected:font-medium aria-selected:text-background"
          >
            {tab.label}
            <span className="tabular-nums">{tab.items.length + tab.more}</span>
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`report-panel-${tab.key}`}
          aria-labelledby={`report-tab-${tab.key}`}
          className={cn(tab.key !== current && "hidden print:block", "print:mb-4")}
        >
          <h3 className="mb-1 hidden text-sm font-semibold print:block">{tab.label}</h3>
          <CaseList tab={tab} />
        </div>
      ))}
    </ReportCard>
  );
}

/** "Como contamos": opens and closes on screen, always open on paper. */
export function ReportRules({ rules }: { rules: readonly ReportRule[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="surface-card rounded-3xl bg-card px-5 break-inside-avoid">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="report-rules"
          onClick={() => setOpen((previous) => !previous)}
          className="flex min-h-14 w-full items-center justify-between gap-3 text-left text-subhead font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Como contamos
          <CaretDownIcon
            aria-hidden="true"
            className={cn(
              "size-4 text-muted-foreground transition-transform motion-reduce:transition-none print:hidden",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      <dl
        id="report-rules"
        className={cn("grid gap-4 pb-5 sm:grid-cols-2", !open && "hidden print:grid")}
      >
        {rules.map((rule) => (
          <div key={rule.title}>
            <dt className="text-sm font-medium">{rule.title}</dt>
            <dd className="text-sm text-muted-foreground">{rule.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const stampFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

/** "Dados guardados em…" for a closed month, and who generated the page and when. */
export function ReportFooter({
  savedAt,
  generatedAt,
  generatedBy,
}: {
  savedAt: string | null;
  generatedAt: string;
  generatedBy: string;
}) {
  return (
    <footer className="flex flex-wrap justify-between gap-2 px-1 text-footnote text-muted-foreground tabular-nums">
      <span>
        {savedAt === null
          ? "Números calculados na hora; o mês é guardado depois que fecha."
          : `Dados guardados em ${stampFormatter.format(new Date(savedAt))}.`}
      </span>
      <span>
        Gerado por {generatedBy} em {stampFormatter.format(new Date(generatedAt))}
      </span>
    </footer>
  );
}
