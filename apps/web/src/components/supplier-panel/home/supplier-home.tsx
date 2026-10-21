import type { SupplierAttentionTarget } from "@sellbridge/shared/supplier-panel-attention";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { supplierHomeQueryOptions } from "@/features/supplier-panel/home/home.queries";
import { HomeQueue, HomeQueueSkeleton } from "./home-queue";

interface SupplierHomeProps {
  supplierId: string;
  hrefFor: (target: SupplierAttentionTarget) => string;
}

/**
 * "Início" of the supplier panel, one list first (Mercado Livre's "Vendas", Shopee's "Lista de
 * tarefas"): what waits for the accept, what is under way, what to fix in the catalog, each with
 * the product photo, and the health in one line underneath.
 */
export function SupplierHome({ supplierId, hrefFor }: SupplierHomeProps) {
  const query = useQuery(supplierHomeQueryOptions(supplierId));
  const header = (
    <PageHeader
      title="Painel do fornecedor"
      {...(query.data === undefined ? {} : { description: query.data.supplierName })}
      actions={
        <Button asChild>
          <Link to="/fornecedor/painel/produtos" search={{ product: "novo" }}>
            <PlusIcon aria-hidden="true" />
            Cadastrar produto
          </Link>
        </Button>
      }
    />
  );
  // A failed background refresh keeps the list already on screen.
  if (query.isError && query.data === undefined) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          message="Não foi possível carregar o Início, tente de novo."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {header}
      <SupplierQuickLinks />
      {query.data === undefined ? (
        <HomeQueueSkeleton />
      ) : (
        <HomeQueue supplierId={supplierId} data={query.data} hrefFor={hrefFor} />
      )}
    </div>
  );
}

function SupplierQuickLinks() {
  return (
    <section
      aria-label="Atalhos do fornecedor"
      className="surface-card space-y-4 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Seus produtos, do cadastro às vendas</h2>
        <p className="text-sm text-muted-foreground">
          Cadastre fotos, preço e estoque. Envie o produto para análise para que os revendedores
          possam encontrá-lo no catálogo. Você pode voltar e editar os dados depois.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link to="/fornecedor/painel/produtos">Meus produtos</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/fornecedor/painel/importar">Importar produtos por planilha</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/fornecedor/painel/marca">Editar minha marca</Link>
        </Button>
      </div>
    </section>
  );
}
