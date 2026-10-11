import { ArrowSquareOutIcon, BookOpenIcon, BracketsCurlyIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export const API_DOCS_URL = "/api/v1/docs";
export const OPENAPI_URL = "/api/v1/openapi.json";

function DocumentationLinks() {
  return (
    <>
      <Button asChild variant="outline" size="sm">
        <a href={API_DOCS_URL} target="_blank" rel="noreferrer">
          <BookOpenIcon aria-hidden="true" />
          Documentação da API
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
 * The Integrações page: header with the documentation links, then one section per kind of
 * integration (API keys, webhooks...) stacked in the order they are passed.
 */
export function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <PageHeader
        title="Integrações"
        description="Conecte seu ERP, planilhas ou sistema próprio ao SellBridge pela API: consulte catálogo, anúncios, pedidos e finanças e publique anúncios sem abrir o app."
        actions={<DocumentationLinks />}
      />
      {children}
    </div>
  );
}

interface IntegrationsSectionProps {
  id: string;
  title: string;
  description: string;
  /** Main action of the section, shown beside its title (e.g. "Nova chave"). */
  action?: ReactNode;
  children: ReactNode;
}

/** One block of the Integrações page, with a heading that names it for screen readers. */
export function IntegrationsSection({
  id,
  title,
  description,
  action,
  children,
}: IntegrationsSectionProps) {
  const headingId = `${id}-titulo`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-28 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 id={headingId} className="text-subhead font-semibold">
            {title}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
