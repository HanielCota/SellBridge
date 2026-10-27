import { useState } from "react";
import { cn } from "@/lib/utils";
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

/** Variant color (the "- Verde" suffix of the title), shown as a small dot with its name. */
const COLOR_DOTS: Record<string, string> = {
  Preto: "#18181b",
  Branco: "#ffffff",
  Azul: "#2563eb",
  Bege: "#d6c3a1",
  Verde: "#16a34a",
  Rosa: "#ec4899",
  Cinza: "#9ca3af",
};

function variantColor(title: string): string | null {
  const suffix = title.split(" - ").at(-1)?.trim();
  return suffix && suffix in COLOR_DOTS ? suffix : null;
}

/** The hex of the title's variant color ("- Verde"), or null when the title names none. */
export function variantColorHex(title: string): string | null {
  const color = variantColor(title);
  if (color === null) {
    return null;
  }
  return COLOR_DOTS[color] ?? null;
}

/** A bare dot in the thumbnail's corner, or a labeled chip on the larger tile. */
function VariantColorMark({ color, compact }: { color: string; compact: boolean }) {
  if (compact) {
    return (
      <span
        className="absolute right-1 bottom-1 size-2.5 rounded-full ring-2 ring-muted"
        style={{ backgroundColor: COLOR_DOTS[color] }}
      />
    );
  }
  return (
    <span className="absolute bottom-2.5 left-3 inline-flex items-center gap-1.5 rounded-full bg-background py-0.5 pr-2 pl-1 text-xs font-medium text-foreground">
      <span
        className="size-3 rounded-full ring-1 ring-foreground/20"
        style={{ backgroundColor: COLOR_DOTS[color] }}
      />
      {color}
    </span>
  );
}

interface ProductVisualProps {
  imageUrl: string | null;
  title: string;
  categoryName: string | null;
  /** Drains the photo or icon to gray; the variant dot keeps its color to stay identifiable. */
  soldOut?: boolean;
  /** Thumbnail size: a small icon, and the variant color as a bare dot instead of a label. */
  compact?: boolean;
  /**
   * Keeps the bottom-right corner free for a badge the caller overlays there: no variant dot,
   * and the icon nudged toward the top-left so the badge never touches it.
   */
  reserveCorner?: boolean;
  className?: string;
}

/**
 * The supplier's photo when there is one; otherwise a neutral tile with the category icon
 * and the variant color as a small labeled dot (never a full-color block that glares).
 */
export function ProductVisual({
  imageUrl,
  title,
  categoryName,
  soldOut = false,
  compact = false,
  reserveCorner = false,
  className,
}: ProductVisualProps) {
  // Supplier photos live on other servers: a dead link falls back to the tile, not a broken icon.
  const [failedImage, setFailedImage] = useState<string | null>(null);
  if (imageUrl && imageUrl !== failedImage) {
    return (
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        onError={() => setFailedImage(imageUrl)}
        className={cn(
          "w-full bg-muted object-cover",
          soldOut && "brightness-75 grayscale",
          className,
        )}
      />
    );
  }
  const color = variantColor(title);
  const Icon = (categoryName ? CATEGORY_ICONS[categoryName] : undefined) ?? PackageIcon;
  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center bg-muted text-muted-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <Icon
        className={cn(
          compact ? "size-5" : "size-9",
          reserveCorner && "-translate-x-0.5 -translate-y-0.5",
          soldOut && "opacity-40",
        )}
        weight="light"
      />
      {color && !(compact && reserveCorner) ? (
        <VariantColorMark color={color} compact={compact} />
      ) : null}
    </div>
  );
}
