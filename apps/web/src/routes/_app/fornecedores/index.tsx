import { supplierListSearchSchema } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MapPinIcon, PackageIcon, StorefrontIcon } from "@phosphor-icons/react";
import { SearchInput } from "@/components/data/search-input";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { SupplierLogo } from "@/components/suppliers/supplier-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { suppliersQueryOptions } from "@/features/suppliers/suppliers.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

const ALL_NICHES = "__all__";

export const Route = createFileRoute("/_app/fornecedores/")({
  validateSearch: supplierListSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, suppliersQueryOptions(search)),
  head: () => ({ meta: [{ title: "Fornecedores | SellBridge" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const search = Route.useSearch();
  const { region } = Route.useRouteContext();
  return (
    <>
      <PageHeader
        title="Fornecedores"
        description="Atacadistas que entregam na sua região. Escolha um para ver o catálogo."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/onboarding">
              <MapPinIcon aria-hidden="true" />
              {region.city} - {region.state}
            </Link>
          </Button>
        }
      />
      <SupplierFilters />
      <SupplierList search={search} />
    </>
  );
}

function SupplierFilters() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) =>
      void navigate({ search: (previous) => ({ ...previous, query }), replace: true }),
  });
  const { data } = useQuery(suppliersQueryOptions(search));
  const niches = data?.niches ?? [];

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SearchInput
        label="Buscar fornecedor"
        placeholder="Buscar fornecedor pelo nome"
        className="flex-1"
        value={term}
        onValueChange={setTerm}
      />
      <Select
        value={search.niche ?? ALL_NICHES}
        onValueChange={(value) =>
          void navigate({
            search: (previous) => ({
              ...previous,
              niche: value === ALL_NICHES ? undefined : value,
            }),
          })
        }
      >
        <SelectTrigger className="sm:w-56" aria-label="Filtrar por nicho">
          <SelectValue>{search.niche ?? "Todos os nichos"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_NICHES}>Todos os nichos</SelectItem>
          {niches.map((niche) => (
            <SelectItem key={niche} value={niche}>
              {niche}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SupplierList({ search }: { search: ReturnType<typeof Route.useSearch> }) {
  const query = useQuery(suppliersQueryOptions(search));

  if (query.isPending) {
    return <SupplierListSkeleton />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.suppliers.length === 0) {
    return (
      <EmptyState
        icon={StorefrontIcon}
        title="Nenhum fornecedor encontrado"
        description={
          search.query || search.niche
            ? "Tente outro nome ou outro nicho."
            : "Ainda não há fornecedores atendendo a sua região."
        }
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {query.data.suppliers.map((supplier) => (
        <li key={supplier.id}>
          <Card className="surface-interactive h-full has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} />
              <div className="min-w-0 space-y-1">
                <CardTitle className="truncate text-base">
                  <Link
                    to="/fornecedores/$supplierId"
                    params={{ supplierId: supplier.id }}
                    className="after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {supplier.name}
                  </Link>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {supplier.city} - {supplier.state}
                </p>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="line-clamp-2 text-sm text-muted-foreground">{supplier.description}</p>
              {/* Pinned to the bottom so the niche and count line up across a row. */}
              <div className="mt-auto flex items-center justify-between">
                <Badge variant="secondary">{supplier.niche}</Badge>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <PackageIcon className="size-3.5" aria-hidden="true" />
                  {supplier.productCount} produtos
                </span>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function SupplierListSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Carregando fornecedores"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-40 rounded-3xl" />
      ))}
    </div>
  );
}
