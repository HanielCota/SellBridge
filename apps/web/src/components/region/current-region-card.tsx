import type { TenantRegion } from "@sellbridge/database/repositories";
import { formatCep } from "@sellbridge/shared/cep";
import { RegionMapMark } from "./region-map-mark";

/** "Avenida Afonso Pena, 1000 · Sala 2": street, number and complement as one line. */
function streetLine(region: TenantRegion): string {
  const street = region.number ? `${region.street}, ${region.number}` : (region.street ?? "");
  return region.complement ? `${street} · ${region.complement}` : street;
}

/** The address the tenant saved, as it goes on invoices. */
export function CurrentRegionCard({ region }: { region: TenantRegion }) {
  return (
    <section
      aria-labelledby="current-region"
      className="surface-card space-y-5 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="flex items-start gap-4">
        <RegionMapMark className="size-12 shrink-0" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs text-muted-foreground">Seu endereço</p>
          <h2 id="current-region" className="text-xl font-semibold tracking-tight">
            {region.city} · {region.state}
          </h2>
          {region.street ? <p className="text-sm">{streetLine(region)}</p> : null}
          <p className="text-sm text-muted-foreground">
            {region.neighborhood ? `${region.neighborhood} · ` : null}CEP {formatCep(region.cep)}
          </p>
        </div>
      </div>
    </section>
  );
}
