import { ProductVisual } from "@/components/catalog/product-visual";
import { cn } from "@/lib/utils";

/** A product's main photo on the home, with the parcel's units when there is more than one. */
export function HomePhoto({
  imageUrl,
  title,
  quantity = 1,
  soldOut = false,
  large = false,
}: {
  imageUrl: string | null;
  title: string;
  /** Units of the parcel, shown on the photo when more than one. */
  quantity?: number;
  soldOut?: boolean;
  large?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden ring-1 ring-border ring-inset",
        large ? "size-24 rounded-2xl" : "size-13 rounded-xl",
      )}
    >
      <ProductVisual
        imageUrl={imageUrl}
        title={title}
        categoryName={null}
        soldOut={soldOut}
        compact={!large}
        reserveCorner={quantity > 1}
        className="size-full"
      />
      {quantity > 1 && !large ? (
        <span className="absolute right-0.5 bottom-0.5 rounded-md bg-background/90 px-1 text-caption font-medium tabular-nums">
          ×{quantity}
        </span>
      ) : null}
    </span>
  );
}
