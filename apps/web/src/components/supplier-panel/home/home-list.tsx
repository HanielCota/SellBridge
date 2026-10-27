import { CaretRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ProductVisual, variantColorHex } from "@/components/catalog/product-visual";
import { cn } from "@/lib/utils";

/**
 * The pieces of the home's single list: a group with its count, and a row that opens in place.
 * Every row reads the same way (photo, name, one line of detail, the deadline or status on the
 * right), so the eye runs down one column instead of hunting per kind of task.
 */

/**
 * Without a photo, the thumbnail is the variant's color with the product's initial: eleven rows
 * of the same package icon read as one blur, a tinted tile tells them apart at a glance.
 */
function VariantTile({ title, hex, soldOut }: { title: string; hex: string; soldOut: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-full items-center justify-center text-lg font-semibold text-foreground",
        soldOut && "opacity-50 grayscale",
      )}
      style={{ backgroundColor: `color-mix(in oklch, ${hex} 40%, var(--card))` }}
    >
      {title.trim().charAt(0).toUpperCase()}
    </span>
  );
}

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
  const tint = imageUrl === null && !large ? variantColorHex(title) : null;
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden ring-1 ring-border ring-inset",
        large ? "size-24 rounded-2xl" : "size-13 rounded-xl",
      )}
    >
      {tint === null ? (
        <ProductVisual
          imageUrl={imageUrl}
          title={title}
          categoryName={null}
          soldOut={soldOut}
          compact={!large}
          reserveCorner={quantity > 1}
          className="size-full"
        />
      ) : (
        <VariantTile title={title} hex={tint} soldOut={soldOut} />
      )}
      {quantity > 1 && !large ? (
        <span className="absolute right-0.5 bottom-0.5 rounded-md bg-background/90 px-1 text-caption font-medium tabular-nums">
          ×{quantity}
        </span>
      ) : null}
    </span>
  );
}

interface HomeListGroupProps {
  /** The anchor the summary above the list jumps to. */
  id: string;
  title: string;
  total: number;
  /** "3 atrasados", said in red beside the count; null when nothing is late. */
  late?: string | null;
  /**
   * One plain line on what the step asks for. A group with a hint is a main step (accept,
   * dispatch) and gets the stronger header band; the catalog fixes stay plain.
   */
  hint?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function HomeListGroup({
  id,
  title,
  total,
  late = null,
  hint,
  action,
  footer,
  children,
}: HomeListGroupProps) {
  const main = hint !== undefined;
  return (
    <section id={id} aria-label={title} className="scroll-mt-24 border-border not-first:border-t">
      <div className={cn(main && "border-b border-border bg-foreground/[0.035] pb-3")}>
        <div className={cn("flex min-h-8 items-center gap-2 px-5 pt-4", main ? "pb-1" : "pb-1.5")}>
          <h2 className={cn(main ? "text-[1.0625rem] font-semibold" : "text-subhead font-medium")}>
            {title}
          </h2>
          <span
            className={cn(
              "flex-1 tabular-nums",
              main
                ? "text-[1.0625rem] font-semibold text-muted-foreground"
                : "text-sm text-muted-foreground",
            )}
          >
            {total}
            {late === null ? null : (
              <span className="ml-2 text-sm font-medium text-destructive">{late}</span>
            )}
          </span>
          {action}
        </div>
        {main ? <p className="px-5 text-footnote text-muted-foreground">{hint}</p> : null}
      </div>
      <ul className="[&>li+li]:border-t [&>li+li]:border-border/60">{children}</ul>
      {footer}
    </section>
  );
}

interface HomeListRowProps {
  id: string;
  expanded: boolean;
  onToggle: () => void;
  photo: ReactNode;
  title: string;
  detail: ReactNode;
  trailing: ReactNode;
  /** What opens under the row: the larger photo and the row's actions. */
  children: ReactNode;
}

export function HomeListRow({
  id,
  expanded,
  onToggle,
  photo,
  title,
  detail,
  trailing,
  children,
}: HomeListRowProps) {
  const panelId = `home-row-${id}`;
  return (
    // The open row and its panel share one tint, so the panel never reads as a loose block.
    <li className={cn(expanded && "bg-foreground/[0.03]")}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_1rem] sm:grid-cols-[auto_minmax(0,1fr)_auto_1rem] items-center gap-3.5 px-5 py-2.5 text-left outline-none select-none transition-[background-color,box-shadow] duration-100 hover:row-lift focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        {photo}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-footnote text-muted-foreground">
            {detail}
          </span>
          {/* On a phone the deadline drops under the name, so the name keeps the width. */}
          <span className="mt-1 block sm:hidden">{trailing}</span>
        </span>
        <span className="hidden justify-self-end sm:block">{trailing}</span>
        <CaretRightIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            expanded && "rotate-90",
          )}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        // Indented to the name and ending where the deadline ends, not at the card's edge.
        <div
          id={panelId}
          className="flex flex-wrap items-center gap-3 px-5 pt-1 pb-4 sm:pr-[3.125rem] sm:pl-[5.375rem]"
        >
          {children}
        </div>
      ) : null}
    </li>
  );
}

/** A row with a single action: the button sits on the row, with nothing to open first. */
export function HomeActionRow({
  photo,
  title,
  detail,
  action,
}: {
  photo: ReactNode;
  title: string;
  detail: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3.5 px-5 py-2.5">
      {photo}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-footnote text-muted-foreground">
          {detail}
        </span>
      </span>
      <span className="shrink-0">{action}</span>
    </li>
  );
}
