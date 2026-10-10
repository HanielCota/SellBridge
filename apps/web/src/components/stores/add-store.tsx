import { ArrowRightIcon } from "@phosphor-icons/react";
import type { MarketplaceOption } from "@/features/stores/stores.functions";
import { MarketplaceMark } from "./marketplace-mark";

const DESCRIPTIONS: Record<string, string> = {
  mock: "Teste o fluxo completo (publicar, vender, sincronizar) sem uma conta real.",
  mercado_livre: "Entre com sua conta de vendedor do Mercado Livre.",
  shopee: "Entre com a conta da sua loja na Shopee.",
  tiktok_shop: "Entre com a conta da sua loja no TikTok Shop.",
};

function AvailableOption({ option }: { option: MarketplaceOption }) {
  return (
    <li>
      <a
        href={`/api/oauth/${option.id}/start`}
        aria-label={`Conectar ${option.label}`}
        className="surface-interactive flex items-center gap-4 rounded-3xl bg-card p-4 dark:bg-muted/60 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        <MarketplaceMark marketplace={option.id} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{option.label}</span>
          <span className="block text-sm text-muted-foreground">{DESCRIPTIONS[option.id]}</span>
        </span>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
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
      <p className="text-sm font-medium text-muted-foreground">Em breve</p>
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => (
          <li
            key={option.id}
            className="flex items-center gap-2.5 rounded-full bg-card py-1.5 pr-4 pl-1.5 text-sm text-muted-foreground ring-1 ring-border dark:bg-muted/40 dark:ring-0"
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
