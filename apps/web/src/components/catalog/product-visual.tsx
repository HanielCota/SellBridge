import { cn } from "cn";
import {
  BabyIcon,
  BarbellIcon,
  CookingPotIcon,
  CouchIcon,
  DeviceMobileIcon,
  HandbagIcon,
  NotebookIcon,
  PackageIcon,
  PawPrintIcon,
  SneakerIcon,
  SparkleIcon,
  TShirtIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";

const CATEGORY_ICONS: Record<string, PhosphorIcon> = {
  "Moda feminina": TShirtIcon,
  "Moda masculina": TShirtIcon,
  Calçados: SneakerIcon,
  Acessórios: HandbagIcon,
  "Beleza e cuidados": SparkleIcon,
  Cosméticos: SparkleIcon,
  "Casa e decoração": CouchIcon,
  Cozinha: CookingPotIcon,
  Eletrônicos: DeviceMobileIcon,
  Pet: PawPrintIcon,
  "Pet shop": PawPrintIcon,
  Fitness: BarbellIcon,
  Papelaria: NotebookIcon,
  "Infantil e brinquedos": BabyIcon,
};

/** Variant color (the "- Verde" suffix of the title) shown as a soft swatch. */
const COLOR_SWATCHES: Record<string, string> = {
  Preto: "bg-zinc-800 text-zinc-100",
  Branco: "bg-white text-zinc-500 ring-1 ring-inset ring-black/5",
  Azul: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  Bege: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
  Verde: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Rosa: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  Cinza: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200",
};

function variantColor(title: string): string | null {
  const suffix = title.split(" - ").at(-1)?.trim();
  return suffix && suffix in COLOR_SWATCHES ? suffix : null;
}

interface ProductVisualProps {
  imageUrl: string | null;
  title: string;
  categoryName: string | null;
  className?: string;
}

/**
 * The supplier's photo when there is one; otherwise an honest stand-in (variant color +
 * category icon) instead of a random stock image.
 */
export function ProductVisual({ imageUrl, title, categoryName, className }: ProductVisualProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        className={cn("w-full bg-muted object-cover", className)}
      />
    );
  }
  const color = variantColor(title);
  const Icon = (categoryName ? CATEGORY_ICONS[categoryName] : undefined) ?? PackageIcon;
  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center",
        color ? COLOR_SWATCHES[color] : "bg-muted text-muted-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-10 opacity-75" weight="light" />
      {color ? (
        <span className="absolute bottom-2.5 left-3 text-[11px] font-medium opacity-80">
          {color}
        </span>
      ) : null}
    </div>
  );
}
