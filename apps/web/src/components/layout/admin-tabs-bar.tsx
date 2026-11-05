import { useRef } from "react";
import { scrollEdgeMask, useScrollEdges } from "@/components/data/use-scroll-edges";
import { activeNavItemTo, type NavItem } from "@/features/navigation/nav-items";
import { NavTab, type BadgeCounts } from "./nav-tab";

/**
 * The team's pages in team mode, as a strip under the header from `lg`: the sidebar keeps the
 * profile's own pages. Where the row is too narrow (sidebar open below 1440px) it scrolls, and
 * the faded edge shows there are more tabs.
 */
export function AdminTabsBar({
  items,
  pathname,
  counts,
}: {
  items: readonly NavItem[];
  pathname: string;
  counts: BadgeCounts;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const mask = scrollEdgeMask(useScrollEdges(containerRef));
  if (items.length === 0) {
    return null;
  }
  const activeTo = activeNavItemTo(items, pathname);
  return (
    <nav
      ref={containerRef}
      aria-label="Administração"
      className="hidden w-full min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-card p-2 [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden"
      style={mask === undefined ? undefined : { maskImage: mask }}
    >
      {items.map((item) => (
        <NavTab
          key={item.to}
          item={item}
          isActive={item.to === activeTo}
          count={item.badge ? counts[item.badge] : 0}
          withHint
          inline
        />
      ))}
    </nav>
  );
}
