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

interface ProductVisualProps {
  imageUrl: string | null;
  title: string;
  categoryName: string | null;
  className?: string;
}

/**
 * The supplier's photo when there is one; otherwise a neutral tile with the category icon
 * and the variant color as a small labeled dot (never a full-color block that glares).
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
        "relative flex w-full items-center justify-center bg-muted text-muted-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-9" weight="light" />
      {color ? (
        <span className="absolute bottom-2.5 left-3 inline-flex items-center gap-1.5 rounded-full bg-background py-0.5 pr-2 pl-1 text-caption font-medium text-foreground">
          <span
            className="size-3 rounded-full ring-1 ring-foreground/20"
            style={{ backgroundColor: COLOR_DOTS[color] }}
          />
          {color}
        </span>
      ) : null}
    </div>
  );
}
