import {
  BarbellIcon,
  CookingPotIcon,
  CouchIcon,
  DressIcon,
  HandbagIcon,
  HeadphonesIcon,
  type Icon,
  NotebookIcon,
  PackageIcon,
  PawPrintIcon,
  PuzzlePieceIcon,
  SneakerIcon,
  SparkleIcon,
  TShirtIcon,
} from "@phosphor-icons/react";

const CATEGORY_ICONS: Record<string, Icon> = {
  "moda-feminina": DressIcon,
  "moda-masculina": TShirtIcon,
  calcados: SneakerIcon,
  acessorios: HandbagIcon,
  beleza: SparkleIcon,
  casa: CouchIcon,
  cozinha: CookingPotIcon,
  eletronicos: HeadphonesIcon,
  pet: PawPrintIcon,
  fitness: BarbellIcon,
  papelaria: NotebookIcon,
  infantil: PuzzlePieceIcon,
};

/** Supplier photo when there is one; otherwise the category icon, so rows stay scannable. */
export function ListingThumb({
  imageUrl,
  categorySlug,
}: {
  imageUrl: string | null;
  categorySlug: string | null;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        className="size-12 shrink-0 rounded-xl bg-muted object-cover"
      />
    );
  }
  const CategoryIcon = (categorySlug ? CATEGORY_ICONS[categorySlug] : undefined) ?? PackageIcon;
  return (
    <span
      aria-hidden="true"
      className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
    >
      <CategoryIcon className="size-5" />
    </span>
  );
}
