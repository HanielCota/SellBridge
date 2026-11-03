import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { Link } from "@tanstack/react-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import { BrandIcon } from "@/components/brand/brand-logo";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { SELLER_HOME_PATH, SUPPLIER_PANEL_PATH } from "@/features/auth/profile-routes";
import { cn } from "@/lib/utils";
import { AccountNavList, NavList, ProfileSwitch } from "./nav-list";
import type { AppNavigationState } from "./use-app-navigation";

const CollapseIcon = ACTION_ICONS.collapseSidebar.icon;

/** Where the choice to keep the sidebar shrunk survives a reload; one per browser. */
const COLLAPSED_STORAGE_KEY = "sellbridge-sidebar-collapsed";
const COLLAPSED_EVENT = "sellbridge-sidebar-collapsed-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

type SidebarMode = "expanded" | "collapsed";

function readMode(): SidebarMode {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "on" ? "collapsed" : "expanded";
  } catch {
    // Storage may be unavailable (private mode); the sidebar opens expanded.
    return "expanded";
  }
}

function getServerSnapshot(): SidebarMode {
  return "expanded";
}

function writeMode(mode: SidebarMode): void {
  if (mode === "collapsed") {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, "on");
    return;
  }
  localStorage.removeItem(COLLAPSED_STORAGE_KEY);
}

function saveMode(mode: SidebarMode): void {
  try {
    writeMode(mode);
  } catch {
    // Storage may be unavailable (private mode); the choice lasts until the page reloads.
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

/** Whether the sidebar shows only its icons, remembered per browser. */
function useSidebarMode() {
  const mode = useSyncExternalStore(subscribe, readMode, getServerSnapshot);
  const toggle = useCallback(
    () => saveMode(readMode() === "collapsed" ? "expanded" : "collapsed"),
    [],
  );
  return { mode, toggle };
}

function SideNavHome({ isSupplier, collapsed }: { isSupplier: boolean; collapsed: boolean }) {
  return (
    <Link
      to={isSupplier ? SUPPLIER_PANEL_PATH : SELLER_HOME_PATH}
      aria-label={isSupplier ? "SellBridge, painel do fornecedor" : "SellBridge, visão geral"}
      className={cn(
        "flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        collapsed ? "justify-center" : "px-2",
      )}
    >
      <BrandIcon className="size-9 shrink-0" />
      {collapsed ? null : (
        <span aria-hidden="true" className="text-lg font-semibold tracking-tight">
          SellBridge
        </span>
      )}
    </Link>
  );
}

function CollapseButton({ mode, onToggle }: { mode: SidebarMode; onToggle: () => void }) {
  const collapsed = mode === "collapsed";
  const label = collapsed ? "Abrir o menu lateral" : "Recolher o menu lateral";
  return (
    <Hint label={label} openOnTap={false}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={mode === "expanded"}
        onClick={onToggle}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full text-base text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40",
          collapsed ? "justify-center" : "px-4",
        )}
      >
        <CollapseIcon className="size-5 shrink-0" aria-hidden="true" />
        {collapsed ? null : <span>Recolher menu</span>}
      </button>
    </Hint>
  );
}

/**
 * The desktop menu, fixed on the left from `lg`: every page in groups, with the account's own
 * pages at the foot. Below `lg` the same list opens from the header's menu button.
 */
export function SideNav({
  state,
  profileKind,
}: {
  state: AppNavigationState;
  profileKind: ProfileKind;
}) {
  const { mode, toggle } = useSidebarMode();
  const collapsed = mode === "collapsed";
  const [shownKind, setShownKind] = useState<ProfileKind>(profileKind);
  const list = {
    navigation: state.navigation,
    shownKind,
    pathname: state.pathname,
    counts: state.counts,
    collapsed,
    withHint: true,
  };
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col gap-4 border-r border-border bg-card py-5 lg:flex",
        collapsed ? "w-20 px-3" : "w-64 px-4",
      )}
    >
      <SideNavHome isSupplier={profileKind === "supplier"} collapsed={collapsed} />
      {collapsed ? null : (
        <ProfileSwitch
          sections={state.navigation.profileSections}
          shownKind={shownKind}
          onChange={setShownKind}
        />
      )}
      <nav
        aria-label="Principal"
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 [scrollbar-width:thin]"
      >
        <NavList {...list} />
        <div className="mt-auto border-t border-border pt-3">
          <AccountNavList {...list} />
        </div>
      </nav>
      <CollapseButton mode={mode} onToggle={toggle} />
    </aside>
  );
}
