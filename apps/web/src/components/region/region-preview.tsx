import { formatCep } from "@sellbridge/shared/cep";
import { MapPinIcon, WarningIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import type { RegionPreview as RegionPreviewData } from "@/features/region/region.functions";
import { regionPreviewQueryOptions } from "@/features/region/region.queries";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { countLabel } from "./count-label";

const NAMES_SHOWN = 3;

function nameList(names: readonly string[]): string {
  const shown = names.slice(0, NAMES_SHOWN).join(", ");
  const rest = names.length - NAMES_SHOWN;
  return rest > 0 ? `${shown} e mais ${rest}` : shown;
}

function signed(value: number): string {
  if (value > 0) {
    return `+${value.toLocaleString("pt-BR")}`;
  }
  return value < 0 ? `−${(-value).toLocaleString("pt-BR")}` : "0";
}

function DeltaChip({ value, one, many }: { value: number; one: string; many: string }) {
  const label = `${signed(value)} ${Math.abs(value) === 1 ? one : many}`;
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full px-3 text-xs font-medium tabular-nums",
        value > 0 && "bg-brand/15 text-brand-text",
        value < 0 && "bg-destructive/10 text-destructive",
        value === 0 && "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function CoverageImpact({
  preview,
  hasRegion,
}: {
  preview: RegionPreviewData;
  hasRegion: boolean;
}) {
  if (preview.isCurrentRegion) {
    return (
      <p className="text-sm text-muted-foreground">
        É a mesma cidade de hoje: seu catálogo continua igual.
      </p>
    );
  }
  if (!hasRegion) {
    return (
      <p className="text-sm text-muted-foreground">
        {preview.supplierCount === 0
          ? "Nenhum fornecedor entrega nesse CEP ainda."
          : `${countLabel(preview.supplierCount, "fornecedor entrega", "fornecedores entregam")} aqui, com ${countLabel(preview.productCount, "produto", "produtos")}.`}
      </p>
    );
  }
  const supplierDelta = preview.gained.length - preview.lost.length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <DeltaChip value={supplierDelta} one="fornecedor" many="fornecedores" />
        <DeltaChip value={preview.productDelta} one="produto" many="produtos" />
      </div>
      {preview.gained.length > 0 ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Passa a ver: </span>
          {nameList(preview.gained)}
        </p>
      ) : null}
      {preview.lost.length > 0 ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Deixa de ver: </span>
          {nameList(preview.lost)}
        </p>
      ) : null}
    </div>
  );
}

function AffectedListingsWarning({ count }: { count: number }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
      <WarningIcon weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        {count === 1
          ? "1 anúncio seu usa produto de um fornecedor que não entrega nessa região."
          : `${count.toLocaleString("pt-BR")} anúncios seus usam produtos de fornecedores que não entregam nessa região.`}{" "}
        Eles continuam publicados, mas esses produtos somem do seu catálogo.
      </p>
    </div>
  );
}

/** Address and catalog impact of a CEP, shown before the tenant saves it. */
export function RegionPreview({ cep, hasRegion }: { cep: string; hasRegion: boolean }) {
  const query = useQuery(regionPreviewQueryOptions(cep));
  if (query.isPending) {
    return (
      <div className="space-y-2 rounded-2xl bg-muted/60 p-4" aria-busy="true">
        <span className="sr-only">Consultando CEP...</span>
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {errorMessage(query.error)}
      </p>
    );
  }
  const preview = query.data;
  const street = [preview.address.street, preview.address.neighborhood].filter(Boolean).join(", ");
  const showWarning = hasRegion && !preview.isCurrentRegion && preview.affectedListings > 0;
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="space-y-3 rounded-2xl bg-muted/60 p-4">
        <div className="flex items-start gap-3">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {preview.address.city} - {preview.address.state}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {street.length > 0 ? `${street} · ` : null}CEP {formatCep(preview.address.cep)}
            </p>
          </div>
        </div>
        <CoverageImpact preview={preview} hasRegion={hasRegion} />
      </div>
      {showWarning ? <AffectedListingsWarning count={preview.affectedListings} /> : null}
    </div>
  );
}
