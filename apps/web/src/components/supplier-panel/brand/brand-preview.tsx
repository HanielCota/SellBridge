import { SupplierLogo } from "@/components/suppliers/supplier-logo";
import { Badge } from "@/components/ui/badge";

interface BrandPreviewProps {
  name: string;
  niche: string;
  city: string;
  state: string;
  description: string;
  logoUrl: string | null;
}

/** The brand's card as the supplier directory draws it (`/fornecedores`), live while typing. */
export function BrandPreview({
  name,
  niche,
  city,
  state,
  description,
  logoUrl,
}: BrandPreviewProps) {
  const shownName = name.trim() === "" ? "Nome da marca" : name;
  const shownCity = city.trim() === "" ? "Cidade" : city;
  return (
    <aside aria-label="Prévia no catálogo" className="grid min-w-0 gap-2">
      <p className="text-footnote font-medium text-muted-foreground">Prévia no catálogo</p>
      <div className="grid gap-3 rounded-3xl bg-background p-4 ring-1 ring-border">
        <div className="flex items-start gap-3">
          <SupplierLogo name={shownName} logoUrl={logoUrl} />
          <div className="min-w-0 space-y-1">
            <p className="truncate font-semibold">{shownName}</p>
            <p className="text-xs text-muted-foreground">
              {shownCity} - {state}
            </p>
          </div>
        </div>
        {description.trim() === "" ? null : (
          <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
        )}
        {niche.trim() === "" ? null : (
          <div>
            <Badge variant="secondary">{niche}</Badge>
          </div>
        )}
      </div>
    </aside>
  );
}
