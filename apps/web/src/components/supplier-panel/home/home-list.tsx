import { CaretRightIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ProductVisual } from "@/components/catalog/product-visual";
import { cn } from "@/lib/utils";

/**
 * The pieces of the home's single list: a group with its count, and a row that opens in place.
 * Every row reads the same way (photo, name, one line of detail, the deadline or status on the
 * right), so the eye runs down one column instead of hunting per kind of task.
 */

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

export function HomeListGroup({
  title,
  total,
  action,
  footer,
  children,
}: {
  title: string;
  total: number;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="border-border not-first:border-t">
      <div className="flex min-h-8 items-center gap-2 px-5 pt-4 pb-1.5">
        <h2 className="text-subhead font-medium">{title}</h2>
        <span className="flex-1 text-sm text-muted-foreground tabular-nums">{total}</span>
        {action}
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
    <li>
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
        <div id={panelId} className="flex flex-wrap items-center gap-4 px-5 pb-4 sm:pl-[5.375rem]">
          {children}
        </div>
      ) : null}
    </li>
  );
}
