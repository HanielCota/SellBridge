import type { SupplierSummary, TenantRegion } from "@sellbridge/database/repositories";
import { formatCep } from "@sellbridge/shared/cep";
import { CaretRightIcon, MapPinIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { SupplierLogo } from "@/components/suppliers/supplier-logo";
import { countLabel } from "./count-label";

const SUPPLIERS_SHOWN = 5;

function RegionStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted/60 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value.toLocaleString("pt-BR")}</dd>
    </div>
  );
}

function SupplierRow({ supplier }: { supplier: SupplierSummary }) {
  return (
    <li>
      <Link
        to="/fornecedores/$supplierId"
        params={{ supplierId: supplier.id }}
        className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-muted/60 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{supplier.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{supplier.niche}</span>
        </span>
        <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {countLabel(supplier.productCount, "produto", "produtos")}
        </span>
        <CaretRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

function RegionSuppliers({ suppliers }: { suppliers: SupplierSummary[] }) {
  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum fornecedor entrega nessa região ainda. Tente o CEP de uma cidade próxima.
      </p>
    );
  }
  const hidden = suppliers.length - SUPPLIERS_SHOWN;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Quem entrega aqui</h3>
      <ul>
        {suppliers.slice(0, SUPPLIERS_SHOWN).map((supplier) => (
          <SupplierRow key={supplier.id} supplier={supplier} />
        ))}
      </ul>
      {hidden > 0 ? (
        <Link
          to="/fornecedores"
          className="inline-block text-sm font-medium text-brand-text underline-offset-4 hover:underline"
        >
          Ver todos os {suppliers.length} fornecedores
        </Link>
      ) : null}
    </div>
  );
}

/** Where the tenant is today and which suppliers that unlocks. */
export function CurrentRegionCard({
  region,
  suppliers,
}: {
  region: TenantRegion;
  suppliers: SupplierSummary[];
}) {
  const productCount = suppliers.reduce((total, supplier) => total + supplier.productCount, 0);
  return (
    <section
      aria-labelledby="current-region"
      className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-brand-text">
          <MapPinIcon weight="fill" className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs text-muted-foreground">Sua região</p>
          <h2 id="current-region" className="text-xl font-semibold tracking-tight">
            {region.city} · {region.state}
          </h2>
          <p className="text-sm text-muted-foreground">
            {region.neighborhood ? `${region.neighborhood} · ` : null}CEP {formatCep(region.cep)}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <RegionStat label="Fornecedores" value={suppliers.length} />
        <RegionStat label="Produtos no catálogo" value={productCount} />
      </dl>
      <RegionSuppliers suppliers={suppliers} />
    </section>
  );
}
