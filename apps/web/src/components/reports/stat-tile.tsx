import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { Sparkline } from "./figures";

const SeeAllIcon = ACTION_ICONS.seeAll.icon;

export interface StatTileLink {
  to: NonNullable<LinkProps["to"]>;
  search?: LinkProps["search"];
  /** What a screen reader hears: where the tile leads. */
  ariaLabel: string;
}

export interface StatTileProps {
  label: string;
  figure: ReactNode;
  /** How the figure moved against the previous period (or the team), plus any short note. */
  change: ReactNode;
  /** The figure's shape over the period. */
  trend: readonly number[];
  /** Tooltip on the whole tile: where it leads, and what the name means when it is jargon. */
  hint: string;
  /** Dotted underline on a name a reader may not know; the hint explains it. */
  isTerm?: boolean;
  /** Where the tile leads; without one it is a plain card with no arrow. */
  link?: StatTileLink;
}

function TileBody({ label, figure, change, trend, isTerm = false, link }: StatTileProps) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("text-sm text-muted-foreground", isTerm && "hinted-term")}>
          {label}
        </span>
        {link ? (
          <SeeAllIcon
            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex h-9 items-end text-[30px] leading-none">{figure}</div>
          <div className="flex min-h-4 flex-wrap items-center gap-x-1.5 text-xs">{change}</div>
        </div>
        <Sparkline values={trend} className="mb-1" />
      </div>
    </>
  );
}

const TILE_CLASSES = "flex min-h-36 flex-col justify-between gap-3 rounded-3xl bg-card p-5";

/**
 * One stat tile: name, the number, how it moved and a sparkline. Every tile has the same parts in
 * the same places, so a column of them reads in one pass. The period lives in the page header.
 */
export function StatTile(props: StatTileProps) {
  const { link, hint } = props;
  if (!link) {
    return (
      <Hint label={hint}>
        <div
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the hint explains the figure (its sample, its rule), so it must be reachable by keyboard; a tap opens it on touch
          tabIndex={0}
          className={cn(
            "surface-card outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            TILE_CLASSES,
          )}
        >
          <TileBody {...props} />
        </div>
      </Hint>
    );
  }
  return (
    <Hint label={hint} openOnTap={false}>
      <Link
        to={link.to}
        {...(link.search === undefined ? {} : { search: link.search })}
        aria-label={link.ariaLabel}
        className={cn(
          "group surface-interactive outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          TILE_CLASSES,
        )}
      >
        <TileBody {...props} />
      </Link>
    </Hint>
  );
}
