import { supplierListSearchSchema } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MapPin, Package, Search, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { suppliersQueryOptions } from "@/features/suppliers/suppliers.queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

const ALL_NICHES = "__all__";

export const Route = createFileRoute("/_app/fornecedores/")({
  validateSearch: supplierListSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => prefetchOnServer(context.queryClient, suppliersQueryOptions(deps)),
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
              <MapPin aria-hidden="true" />
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
  const [term, setTerm] = useState(search.q ?? "");
  const debouncedTerm = useDebouncedValue(term, 300);
  const { data } = useQuery(suppliersQueryOptions(search));
  const niches = data?.niches ?? [];

  useEffect(() => {
    const q = debouncedTerm.trim().length > 0 ? debouncedTerm.trim() : undefined;
    if (q === search.q) {
      return;
    }
    void navigate({ search: (previous) => ({ ...previous, q }), replace: true });
  }, [debouncedTerm, navigate, search.q]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Buscar fornecedor"
          placeholder="Buscar fornecedor pelo nome"
          className="pl-9"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </div>
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
          <SelectValue placeholder="Todos os nichos" />
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
        icon={Store}
        title="Nenhum fornecedor encontrado"
        description={
          search.q || search.niche
            ? "Nenhum fornecedor corresponde aos filtros. Tente outros termos."
            : "Ainda não há fornecedores atendendo a sua região. Avisaremos quando chegarem novos."
        }
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {query.data.suppliers.map((supplier) => (
        <li key={supplier.id}>
          <Card className="relative h-full transition-colors hover:border-primary/40">
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
            <CardContent className="relative space-y-3">
              <p className="line-clamp-2 text-sm text-muted-foreground">{supplier.description}</p>
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{supplier.niche}</Badge>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Package className="size-3.5" aria-hidden="true" />
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

function supplierInitials(name: string): string {
  const words = name.split(/s+/).filter((word) => word.length > 2);
  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return initials.length > 0 ? initials : name.charAt(0).toUpperCase();
}

function SupplierLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="size-11 shrink-0 rounded-lg border bg-muted"
        loading="lazy"
      />
    );
  }
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary"
      aria-hidden="true"
    >
      {supplierInitials(name)}
    </span>
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
        <Skeleton key={index} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}
