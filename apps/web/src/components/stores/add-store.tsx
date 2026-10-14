import { ArrowRightIcon } from "@phosphor-icons/react";
import type { MarketplaceOption } from "@/features/stores/stores.functions";
import { GroupedList, MarkSlot } from "./grouped-list";
import { MarketplaceMark } from "./marketplace-mark";

const DESCRIPTIONS: Record<string, string> = {
  mock: "Teste publicar, vender e sincronizar sem uma conta real.",
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
        className="group flex items-center gap-4 px-5 py-3.5 transition-colors outline-none hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset active:bg-foreground/[0.06]"
      >
        <MarkSlot>
          <MarketplaceMark marketplace={option.id} className="size-10" />
        </MarkSlot>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{option.label}</span>
          <span className="hidden truncate text-sm text-muted-foreground sm:block">
            {DESCRIPTIONS[option.id]}
          </span>
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary text-footnote font-semibold text-primary-foreground transition-transform group-active:scale-95 sm:w-auto sm:px-3.5">
          <span className="hidden sm:inline">Conectar</span>
          <ArrowRightIcon className="size-3.5" aria-hidden="true" />
        </span>
      </a>
    </li>
  );
}

function ComingSoonOption({ option }: { option: MarketplaceOption }) {
  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      <MarkSlot>
        <MarketplaceMark marketplace={option.id} className="size-10" />
      </MarkSlot>
      <span className="min-w-0 flex-1 font-medium">{option.label}</span>
      <span className="shrink-0 text-footnote text-muted-foreground">Em breve</span>
    </li>
  );
}

/** Every marketplace in one list: the ones ready to connect first, then the ones on the way. */
export function AddStore({ marketplaces }: { marketplaces: MarketplaceOption[] }) {
  const available = marketplaces.filter((option) => option.available);
  const comingSoon = marketplaces.filter((option) => !option.available);
  return (
    <GroupedList>
      {available.map((option) => (
        <AvailableOption key={option.id} option={option} />
      ))}
      {comingSoon.map((option) => (
        <ComingSoonOption key={option.id} option={option} />
      ))}
    </GroupedList>
  );
}
