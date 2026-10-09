import { ArrowRightIcon } from "@phosphor-icons/react";
import type { MarketplaceOption } from "@/features/stores/stores.functions";
import { MarketplaceMark } from "./marketplace-mark";

const DESCRIPTIONS: Record<string, string> = {
  mock: "Teste o fluxo completo (publicar, vender, sincronizar) sem uma conta real.",
  mercado_livre: "Publique no maior marketplace do Brasil.",
  shopee: "Alcance compradores da Shopee.",
  tiktok_shop: "Venda direto nos vídeos do TikTok.",
};

function AvailableOption({ option }: { option: MarketplaceOption }) {
  return (
    <li>
      <a
        href={`/api/oauth/${option.id}/start`}
        aria-label={`Conectar ${option.label}`}
        className="group flex items-center gap-4 rounded-3xl bg-muted/60 p-4 transition-colors hover:bg-muted focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        <MarketplaceMark marketplace={option.id} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{option.label}</span>
          <span className="block text-sm text-muted-foreground">{DESCRIPTIONS[option.id]}</span>
        </span>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform group-hover:translate-x-0.5">
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </span>
      </a>
    </li>
  );
}

function ComingSoon({ options }: { options: MarketplaceOption[] }) {
  if (options.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Em breve</p>
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => (
          <li
            key={option.id}
            className="flex items-center gap-2.5 rounded-full bg-muted/40 py-1.5 pr-4 pl-1.5 text-sm text-muted-foreground"
          >
            <MarketplaceMark marketplace={option.id} className="size-8 rounded-full" />
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Marketplaces ready to connect, then the ones still on the way (no dead buttons). */
export function AddStore({ marketplaces }: { marketplaces: MarketplaceOption[] }) {
  const available = marketplaces.filter((option) => option.available);
  return (
    <div className="space-y-6">
      <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(20rem,1fr))]">
        {available.map((option) => (
          <AvailableOption key={option.id} option={option} />
        ))}
      </ul>
      <ComingSoon options={marketplaces.filter((option) => !option.available)} />
    </div>
  );
}
