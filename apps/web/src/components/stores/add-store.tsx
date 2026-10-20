import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { SupplierLogo } from "@/components/suppliers/supplier-logo";
import { Button } from "@/components/ui/button";
import { STORES_LOCKED_REASON, useStoresLocked } from "@/components/stores/stores-lock";
import type { MarketplaceOption } from "@/features/stores/stores.functions";
import { GroupedList, MarkSlot } from "./grouped-list";
import { MarketplaceMark } from "./marketplace-mark";
import { useTabProfileLink } from "@/lib/tab-profile";

/** The supplier the shop about to be connected will sell. */
export interface NewStoreSupplier {
  id: string;
  name: string;
  logoUrl: string | null;
  place: string;
}

function startUrl(marketplace: string, supplier: NewStoreSupplier | null): string {
  const path = `/api/oauth/${marketplace}/start`;
  return supplier === null ? path : `${path}?fornecedor=${supplier.id}`;
}

const DESCRIPTIONS: Record<string, string> = {
  mock: "Teste publicar, vender e sincronizar sem uma conta real.",
  mercado_livre: "Entre com sua conta de vendedor do Mercado Livre.",
  shopee: "Entre com a conta da sua loja na Shopee.",
  tiktok_shop: "Entre com a conta da sua loja no TikTok Shop.",
};

function AvailableOption({
  option,
  supplier,
  ownProducts,
}: {
  option: MarketplaceOption;
  supplier: NewStoreSupplier | null;
  ownProducts: boolean;
}) {
  const locked = useStoresLocked();
  const withProfile = useTabProfileLink();
  if (supplier === null && !ownProducts) {
    return <WaitingOption option={option} />;
  }
  if (locked) {
    return <LockedOption option={option} />;
  }
  return (
    <li>
      <a
        href={withProfile(startUrl(option.id, supplier))}
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

/** Ready to connect once the seller picks the supplier the shop will sell. */
/** The same row, without the link, while an admin uses the customer's account. */
function LockedOption({ option }: { option: MarketplaceOption }) {
  return (
    <li title={STORES_LOCKED_REASON} className="flex items-center gap-4 px-5 py-3.5 opacity-60">
      <MarkSlot>
        <MarketplaceMark marketplace={option.id} className="size-10" />
      </MarkSlot>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{option.label}</span>
        <span className="block truncate text-sm text-muted-foreground">{STORES_LOCKED_REASON}</span>
      </span>
    </li>
  );
}

function WaitingOption({ option }: { option: MarketplaceOption }) {
  return (
    <li className="flex items-center gap-4 px-5 py-3.5 text-muted-foreground">
      <MarkSlot>
        <MarketplaceMark marketplace={option.id} className="size-10 opacity-60" />
      </MarkSlot>
      <span className="min-w-0 flex-1 truncate font-medium">{option.label}</span>
      <span className="shrink-0 text-footnote">Escolha o fornecedor</span>
    </li>
  );
}

/** The first row: which supplier the new shop sells, and the way to pick another. */
function SupplierRow({
  supplier,
  onChooseSupplier,
}: {
  supplier: NewStoreSupplier | null;
  onChooseSupplier: () => void;
}) {
  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      <MarkSlot>
        {supplier === null ? (
          <span className="size-11 rounded-lg bg-muted" aria-hidden="true" />
        ) : (
          <SupplierLogo name={supplier.name} logoUrl={supplier.logoUrl} />
        )}
      </MarkSlot>
      <span className="min-w-0 flex-1">
        <span className="block text-footnote text-muted-foreground">A nova loja vende</span>
        <span className="line-clamp-2 block font-medium break-words hyphens-auto">
          {supplier === null ? "Nenhum fornecedor escolhido" : supplier.name}
        </span>
        {supplier === null ? null : (
          <span className="hidden truncate text-sm text-muted-foreground sm:block">
            {supplier.place}
          </span>
        )}
      </span>
      <Button
        type="button"
        size="sm"
        variant={supplier === null ? "default" : "outline"}
        onClick={onChooseSupplier}
        className="shrink-0"
      >
        {supplier === null ? "Escolher" : "Trocar"}
      </Button>
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

/**
 * Own-only stores connect without a supplier. Other new stores require a selected supplier.
 */
export function AddStore({
  marketplaces,
  supplier,
  onChooseSupplier,
  ownProducts = false,
}: {
  marketplaces: MarketplaceOption[];
  supplier: NewStoreSupplier | null;
  onChooseSupplier: () => void;
  ownProducts?: boolean;
}) {
  const available = marketplaces.filter((option) => option.available);
  const comingSoon = marketplaces.filter((option) => !option.available);
  return (
    <GroupedList>
      {ownProducts && supplier === null ? (
        <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <span className="font-medium">This store will sell your own products.</span>
          <Button asChild variant="outline" size="sm">
            <Link to="/onboarding" search={{ step: "supplier" }}>
              Edit product sources
            </Link>
          </Button>
        </li>
      ) : (
        <SupplierRow supplier={supplier} onChooseSupplier={onChooseSupplier} />
      )}
      {available.map((option) => (
        <AvailableOption
          key={option.id}
          option={option}
          supplier={supplier}
          ownProducts={ownProducts}
        />
      ))}
      {comingSoon.map((option) => (
        <ComingSoonOption key={option.id} option={option} />
      ))}
    </GroupedList>
  );
}
