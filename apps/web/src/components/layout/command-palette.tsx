import { formatCents } from "@sellbridge/shared/money";
import {
  ChartLineUpIcon,
  ChatCircleTextIcon,
  type Icon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  PackageIcon,
  ReceiptIcon,
  SquaresFourIcon,
  StorefrontIcon,
  UserCircleIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { type LinkProps, useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { useGlobalSearch } from "@/features/search/use-global-search";
import { searchResultHref } from "@/features/search/search-targets";

interface PageCommand {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: Icon;
  keywords: string;
}

const PAGES: PageCommand[] = [
  {
    label: "Visão geral",
    to: "/dashboard",
    icon: ChartLineUpIcon,
    keywords: "painel vendas lucro",
  },
  {
    label: "Catálogo",
    to: "/catalogo",
    icon: SquaresFourIcon,
    keywords: "produtos fornecedores publicar",
  },
  { label: "Publicações", to: "/publicacoes", icon: MegaphoneIcon, keywords: "anúncios" },
  { label: "Lojas", to: "/lojas", icon: StorefrontIcon, keywords: "marketplace conectar" },
  { label: "Financeiro", to: "/financeiro", icon: WalletIcon, keywords: "pedidos lucro csv" },
  { label: "Meu perfil", to: "/perfil", icon: UserCircleIcon, keywords: "foto conta" },
  { label: "Ajuda e suporte", to: "/suporte", icon: ChatCircleTextIcon, keywords: "chamado ajuda" },
];

function matchesPage(page: PageCommand, term: string): boolean {
  const haystack = `${page.label} ${page.keywords}`.toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

/** Ctrl+K / Cmd+K opens or closes the palette from anywhere. */
function useOpenShortcut(setOpen: (update: (open: boolean) => boolean) => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen]);
}

function Item({
  value,
  icon: ItemIcon,
  title,
  detail,
  onSelect,
}: {
  value: string;
  icon: Icon;
  title: string;
  detail?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm data-[selected=true]:bg-muted"
    >
      <ItemIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {detail ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{detail}</span>
      ) : null}
    </Command.Item>
  );
}

const GROUP_CLASS =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground";

function SearchResults({ term, go }: { term: string; go: (href: string) => void }) {
  const results = useGlobalSearch(term);
  if (!results) {
    return null;
  }
  const { products, listings, orders } = results;
  return (
    <>
      {products.length > 0 ? (
        <Command.Group heading="Catálogo" className={GROUP_CLASS}>
          {products.map((product) => (
            <Item
              key={product.id}
              value={`product-${product.id}`}
              icon={PackageIcon}
              title={product.title}
              detail={`${product.supplierName} · custo ${formatCents(product.costCents)}`}
              onSelect={() => go(searchResultHref.product(product))}
            />
          ))}
        </Command.Group>
      ) : null}
      {listings.length > 0 ? (
        <Command.Group heading="Publicações" className={GROUP_CLASS}>
          {listings.map((listing) => (
            <Item
              key={listing.id}
              value={`listing-${listing.id}`}
              icon={MegaphoneIcon}
              title={listing.title}
              detail={formatCents(listing.priceCents)}
              onSelect={() => go(searchResultHref.listing(listing))}
            />
          ))}
        </Command.Group>
      ) : null}
      {orders.length > 0 ? (
        <Command.Group heading="Pedidos" className={GROUP_CLASS}>
          {orders.map((order) => (
            <Item
              key={order.id}
              value={`order-${order.id}`}
              icon={ReceiptIcon}
              title={order.externalOrderId}
              detail={`${order.buyerName ?? "Comprador"} · ${formatCents(order.totalCents)}`}
              onSelect={() => go(searchResultHref.order(order))}
            />
          ))}
        </Command.Group>
      ) : null}
    </>
  );
}

function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Buscar (Ctrl+K)"
      className="flex size-11 shrink-0 items-center justify-center gap-2 rounded-full bg-card text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 2xl:w-auto 2xl:px-4"
    >
      <MagnifyingGlassIcon className="size-5 2xl:size-4" aria-hidden="true" />
      <span className="hidden 2xl:inline">Buscar</span>
      <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 font-sans text-caption 2xl:inline">
        Ctrl K
      </kbd>
    </button>
  );
}

/** Search box in the header plus the Ctrl+K palette: pages, catalog, listings and orders. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  useOpenShortcut(setOpen);
  function go(href: string) {
    setOpen(false);
    setTerm("");
    void navigate({ href });
  }
  const pages = term.trim() ? PAGES.filter((page) => matchesPage(page, term.trim())) : PAGES;
  return (
    <>
      <SearchButton onClick={() => setOpen(true)} />
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed top-[12svh] left-1/2 z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-xl shadow-black/20 ring-1 ring-border"
          >
            <Dialog.Title className="sr-only">Buscar no SellBridge</Dialog.Title>
            <Command shouldFilter={false} loop>
              <div className="flex items-center gap-3 border-b border-border px-4">
                <MagnifyingGlassIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                <Command.Input
                  value={term}
                  onValueChange={setTerm}
                  placeholder="Buscar produtos, publicações, pedidos ou páginas"
                  className="h-14 flex-1 bg-transparent text-subhead outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Command.List className="max-h-[min(26rem,60svh)] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nada encontrado para essa busca.
                </Command.Empty>
                {pages.length > 0 ? (
                  <Command.Group heading="Páginas" className={GROUP_CLASS}>
                    {pages.map((page) => (
                      <Item
                        key={page.to}
                        value={`page-${page.to}`}
                        icon={page.icon}
                        title={page.label}
                        onSelect={() => go(page.to)}
                      />
                    ))}
                  </Command.Group>
                ) : null}
                <SearchResults term={term} go={go} />
              </Command.List>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
