import { ArrowSquareOutIcon, BookOpenIcon, CodeIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

const API_DOCS_URL = "/api/v1/docs";
const OPENAPI_URL = "/api/v1/openapi.json";

function DocumentationLinks() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <Button asChild variant="outline" size="sm">
        <a href={API_DOCS_URL} target="_blank" rel="noreferrer">
          <BookOpenIcon aria-hidden="true" />
          Documentação técnica
          <ArrowSquareOutIcon aria-hidden="true" />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
      </Button>
      <a
        href={OPENAPI_URL}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Arquivo OpenAPI
        <span className="sr-only">(abre em nova aba)</span>
      </a>
    </p>
  );
}

/**
 * The Integrações page: a plain header, then one section per integration stacked in the order
 * they are passed. What only a programmer uses goes inside `DeveloperArea`, last.
 */
export function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Integrações"
        description="Ligue o SellBridge aos programas que a sua empresa já usa."
      />
      {children}
    </div>
  );
}

/**
 * API keys, webhooks and the technical documentation, in one card below what a reseller uses:
 * its heading tells a lay reseller it can skip all of it.
 */
export function DeveloperArea({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="programadores-titulo" className="surface-card rounded-3xl bg-card">
      <div className="flex items-start gap-3.5 p-5 sm:p-6">
        <span className="grid size-11 flex-none place-items-center rounded-2xl bg-muted text-muted-foreground">
          <CodeIcon aria-hidden="true" className="size-5" />
        </span>
        <div className="grid min-w-0 gap-1">
          <h2 id="programadores-titulo" className="text-subhead font-medium">
            Para programadores
          </h2>
          <p className="text-sm text-muted-foreground">
            Só se você tem um sistema próprio. Para vender, não precisa mexer aqui.
          </p>
        </div>
      </div>
      <div className="space-y-8 border-t border-border p-5 sm:p-6">
        <DocumentationLinks />
        {children}
      </div>
    </section>
  );
}

/** An empty list inside the programmers area: one line and the one button that fills it. */
export function CompactEmpty({ text, action }: { text: string; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3">
      <p className="text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

interface IntegrationsSectionProps {
  id: string;
  title: string;
  description: string;
  /** Main action of the section, shown beside its title (e.g. "Nova chave"). */
  action?: ReactNode;
  /** 3 inside `DeveloperArea`, whose own heading is the 2. */
  level?: 2 | 3;
  children: ReactNode;
}

/** One block of the Integrações page, with a heading that names it for screen readers. */
export function IntegrationsSection({
  id,
  title,
  description,
  action,
  level = 2,
  children,
}: IntegrationsSectionProps) {
  const headingId = `${id}-titulo`;
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-28 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Heading id={headingId} className="text-subhead font-semibold">
            {title}
          </Heading>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
