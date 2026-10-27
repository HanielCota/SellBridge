import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";

/** Every overview card stops at this many rows; a button below opens the full list. */
export const CARD_ROWS = 7;
const SeeAllIcon = ACTION_ICONS.seeAll.icon;
export interface MoreLink {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  search?: LinkProps["search"];
}

/** The button under a capped list, leading to the area that shows every row. */
function MoreButton({ more }: { more: MoreLink }) {
  return (
    <div className="mt-auto pt-4">
      <Link
        to={more.to}
        {...(more.search === undefined ? {} : { search: more.search })}
        className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-muted text-sm font-medium transition-colors outline-none hover:bg-foreground hover:text-background focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {more.label}
        <SeeAllIcon className="size-3.5" weight="bold" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** A card of the overview's bottom row: a quiet title, up to seven rows, then "Ver …". */
export function OverviewCard({
  id,
  title,
  more,
  children,
}: {
  id: string;
  title: string;
  more: MoreLink | null;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="surface-card flex h-full flex-col rounded-3xl bg-card p-5"
    >
      <div className="-my-1 flex h-8 items-center">
        <h2 id={id} className="text-subhead font-medium text-muted-foreground">
          {title}
        </h2>
      </div>
      <div className="mt-5 flex flex-1 flex-col">
        {children}
        {more === null ? null : <MoreButton more={more} />}
      </div>
    </section>
  );
}
