import type { SupplierAttentionTarget } from "@sellbridge/shared/supplier-panel-attention";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { supplierHomeQueryOptions } from "@/features/supplier-panel/home/home.queries";
import { usePanelSupplierActive } from "@/features/supplier-panel/use-panel-supplier";
import { HomeQueue, HomeQueueSkeleton } from "./home-queue";
import { TeamNoticesCard } from "./team-notices-card";

interface SupplierHomeProps {
  supplierId: string;
  hrefFor: (target: SupplierAttentionTarget) => string;
}

/**
 * The shortcuts beside "Cadastrar produto", so the products, the spreadsheet import and the brand
 * sit in the header instead of a card of their own above the list.
 */
function SupplierHeaderActions({ active }: { active: boolean }) {
  return (
    <>
      <Button asChild variant="outline">
        <Link to="/fornecedor/painel/produtos">Meus produtos</Link>
      </Button>
      {/* A switched-off supplier adds no products (the server refuses them too). */}
      {active ? (
        <Button asChild variant="outline">
          <Link to="/fornecedor/painel/importar">Importar por planilha</Link>
        </Button>
      ) : null}
      <Button asChild variant="outline">
        <Link to="/fornecedor/painel/marca">Editar minha marca</Link>
      </Button>
      {active ? (
        <Button asChild>
          <Link to="/fornecedor/painel/produtos" search={{ product: "novo" }}>
            <PlusIcon aria-hidden="true" />
            Cadastrar produto
          </Link>
        </Button>
      ) : null}
    </>
  );
}

/**
 * "Início" of the supplier panel, one list first (Mercado Livre's "Vendas", Shopee's "Lista de
 * tarefas"): the account's health on top, then what waits for the accept, what is under way and
 * what to fix in the catalog, each with the product photo, in a single card.
 */
export function SupplierHome({ supplierId, hrefFor }: SupplierHomeProps) {
  const query = useQuery(supplierHomeQueryOptions(supplierId));
  const active = usePanelSupplierActive();
  const header = (
    <PageHeader
      title="Painel do fornecedor"
      {...(query.data === undefined ? {} : { description: query.data.supplierName })}
      actions={<SupplierHeaderActions active={active} />}
    />
  );
  // A failed background refresh keeps the list already on screen.
  if (query.isError && query.data === undefined) {
    return (
      <div className="space-y-4">
        {header}
        <ErrorState
          message="Não foi possível carregar o Início, tente de novo."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {header}
      <TeamNoticesCard supplierId={supplierId} active={active} />
      {query.data === undefined ? (
        <HomeQueueSkeleton />
      ) : (
        <HomeQueue supplierId={supplierId} data={query.data} hrefFor={hrefFor} active={active} />
      )}
    </div>
  );
}
