import {
  SUPPLIER_FLAG_LIMIT_WARNING,
  supplierFlagCountLabel,
} from "@sellbridge/shared/supplier-flags";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { GoldenRulesList } from "@/components/golden-rules/golden-rules-list";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { teamNoticesQueryOptions } from "@/features/supplier-panel/home/team-notices.queries";

/** "Hoje você tem 1 de 3 em 90 dias." once the flags load; nothing before. */
function OwnFlagCount({ supplierId }: { supplierId: string }) {
  const query = useQuery(teamNoticesQueryOptions(supplierId));
  if (query.data === undefined) {
    return null;
  }
  return (
    <p className="text-sm font-medium">
      Hoje você tem {supplierFlagCountLabel(query.data.length)}.
    </p>
  );
}

function HowFlagsWork({ supplierId }: { supplierId: string }) {
  return (
    <section
      aria-labelledby="flags-how-title"
      className="surface-card space-y-3 rounded-3xl bg-card p-5 sm:p-6"
    >
      <h2 id="flags-how-title" className="text-lg font-semibold">
        Quando uma regra é quebrada
      </h2>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>A equipe pode aplicar uma flag e conta no painel o motivo e a regra quebrada.</li>
        <li>Cada flag vale 90 dias e depois some sozinha.</li>
        <li>{SUPPLIER_FLAG_LIMIT_WARNING} Seus produtos saem do catálogo.</li>
        <li>Não concorda com uma flag? Fale com o suporte e conte o que aconteceu.</li>
      </ul>
      <OwnFlagCount supplierId={supplierId} />
      <Link
        to="/suporte/novo"
        className="inline-block text-sm font-medium text-brand-text underline-offset-4 hover:underline"
      >
        Falar com o suporte
      </Link>
    </section>
  );
}

/**
 * "Regras de ouro" of the supplier panel: the 5 rules every supplier agrees to, each with an
 * example, and what a flag means (like YouTube's community guidelines and strikes).
 */
export function GoldenRulesPage({ supplierId }: { supplierId: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        back={<BackLink to="/fornecedor/painel" label="Início" />}
        title="Regras de ouro"
        description="O que a SellBridge espera de todo fornecedor. Siga as 5 e sua conta fica em dia."
      />
      <section
        aria-label="As 5 regras"
        className="surface-card rounded-3xl bg-card px-5 py-2 sm:px-6"
      >
        <GoldenRulesList />
      </section>
      <HowFlagsWork supplierId={supplierId} />
    </div>
  );
}
