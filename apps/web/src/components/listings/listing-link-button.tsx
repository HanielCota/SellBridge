import type { ListingOverviewRow } from "@sellbridge/database/repositories";
import { ArrowSquareOutIcon, CaretDownIcon } from "@phosphor-icons/react";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LISTING_LINK_WAITING_MESSAGE,
  storeListingLinks,
  type StoreListingLink,
} from "@/features/listings/listing-link";

const BUTTON_CLASS = "self-start max-sm:w-full";

/** The ad on Mercado Livre, in a new tab: the link the marketplace gave when it published it. */
function OpenListingButton({ title, url }: { title: string; url: string }) {
  return (
    <Button asChild variant="outline" size="sm" className={BUTTON_CLASS}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Ver anúncio de ${title} no Mercado Livre (abre em outra aba)`}
      >
        Ver anúncio
        <ArrowSquareOutIcon data-icon="inline-end" aria-hidden="true" />
      </a>
    </Button>
  );
}

/** Published, but Mercado Livre sent no link yet: the button stays, greyed, with the reason. */
function WaitingListingButton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant="outline" size="sm" disabled className={BUTTON_CLASS}>
        Ver anúncio
        <ArrowSquareOutIcon data-icon="inline-end" aria-hidden="true" />
      </Button>
      <p className="text-xs text-muted-foreground">{LISTING_LINK_WAITING_MESSAGE}.</p>
    </div>
  );
}

function StoreLinkItem({ entry }: { entry: StoreListingLink }) {
  const mark = <MarketplaceMark marketplace="mercado_livre" className="size-5 rounded-md" />;
  if (entry.link.kind === "waiting") {
    return (
      <DropdownMenuItem disabled className="items-start data-disabled:opacity-100">
        {mark}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-muted-foreground">{entry.storeName}</span>
          <span className="block text-xs text-muted-foreground">Link ainda não chegou</span>
        </span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem asChild>
      <a href={entry.link.url} target="_blank" rel="noopener noreferrer">
        {mark}
        <span className="min-w-0 flex-1 truncate">{entry.storeName}</span>
        <ArrowSquareOutIcon aria-hidden="true" />
      </a>
    </DropdownMenuItem>
  );
}

/** One ad per store: the button asks which store's ad to open. */
function StoreLinksMenu({ title, entries }: { title: string; entries: StoreListingLink[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={BUTTON_CLASS}
          aria-label={`Ver anúncio de ${title}: escolher a loja`}
        >
          Ver anúncio
          <CaretDownIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="px-2.5 pt-1.5 pb-1 text-xs font-normal text-muted-foreground">
          Abrir o anúncio de qual loja?
        </DropdownMenuLabel>
        {entries.map((entry) => (
          <StoreLinkItem key={entry.storeId} entry={entry} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Ver anúncio" for every Mercado Livre ad of the listing: nothing when it has none, the ad
 * itself for one store, a choice of store for several.
 */
export function ListingLinkButton({ row }: { row: ListingOverviewRow }) {
  const entries = storeListingLinks(row.stores);
  const [only] = entries;
  if (only === undefined) {
    return null;
  }
  if (entries.length > 1) {
    return <StoreLinksMenu title={row.title} entries={entries} />;
  }
  if (only.link.kind === "waiting") {
    return <WaitingListingButton />;
  }
  return <OpenListingButton title={row.title} url={only.link.url} />;
}
