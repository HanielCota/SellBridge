import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

const SeeAllIcon = ACTION_ICONS.seeAll.icon;

export interface BreakdownSectionProps {
  title: string;
  to: NonNullable<LinkProps["to"]>;
  search?: LinkProps["search"];
  /** Tooltip naming where "Ver tudo" leads. */
  hint: string;
  /**
   * The whole card opens the full view (the default). Off when the rows have links of their
   * own, so they stay clickable; then only "Ver tudo" leads there.
   */
  wholeCardLinks?: boolean;
  children: ReactNode;
}

/** A card of the dashboard's bottom row: a quiet title, "Ver tudo" and a short list. */
export function BreakdownSection({
  title,
  to,
  search,
  hint,
  wholeCardLinks = true,
  children,
}: BreakdownSectionProps) {
  // With `wholeCardLinks` the link's hit area is stretched over the card (`after:inset-0`), so a
  // click anywhere opens the full view while screen readers still hear one short link.
  return (
    <section
      className={cn(
        "group flex h-full flex-col rounded-3xl bg-card p-5",
        wholeCardLinks
          ? "surface-interactive has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50"
          : "surface-card",
      )}
    >
      <div className="-my-1 flex h-8 items-center justify-between gap-3">
        <h2
          className={cn(
            "text-subhead font-medium text-muted-foreground",
            wholeCardLinks && "transition-colors group-hover:text-foreground",
          )}
        >
          {title}
        </h2>
        <Hint label={hint} openOnTap={false}>
          <Link
            to={to}
            {...(search === undefined ? {} : { search })}
            aria-label={`Ver tudo em ${title.toLowerCase()}`}
            className={cn(
              "-mr-1.5 flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              wholeCardLinks
                ? "group-hover:bg-foreground group-hover:text-background after:absolute after:inset-0"
                : "hover:bg-foreground hover:text-background",
            )}
          >
            <span aria-hidden="true">Ver tudo</span>
            <SeeAllIcon className="size-3.5" weight="bold" aria-hidden="true" />
          </Link>
        </Hint>
      </div>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </section>
  );
}
