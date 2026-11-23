import { ArrowSquareOutIcon, BookOpenIcon, BracketsCurlyIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

const API_DOCS_URL = "/api/v1/docs";
const OPENAPI_URL = "/api/v1/openapi.json";

function DocumentationLinks() {
  return (
    <>
      <Button asChild variant="outline" size="sm">
        <a href={API_DOCS_URL} target="_blank" rel="noreferrer">
          <BookOpenIcon aria-hidden="true" />
          Documentação técnica
          <ArrowSquareOutIcon aria-hidden="true" />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <a href={OPENAPI_URL} target="_blank" rel="noreferrer">
          <BracketsCurlyIcon aria-hidden="true" />
          OpenAPI
          <span className="sr-only">(abre em nova aba)</span>
        </a>
      </Button>
    </>
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
 * API keys, webhooks and the technical documentation, set apart under its own heading: a lay
 * reseller reads that it can skip all of it.
 */
export function DeveloperArea({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="programadores-titulo"
      className="space-y-8 border-t border-border pt-8"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 id="programadores-titulo" className="text-lg font-semibold">
            Para programadores
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Só para quem tem um sistema próprio ou um programador. Para vender pelo SellBridge, você
            não precisa mexer aqui.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <DocumentationLinks />
        </div>
      </div>
      {children}
    </section>
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
