import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { isStaffRole } from "@sellbridge/shared/staff-access";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState, type ReactNode } from "react";
import { DashboardSetupProvider } from "@/components/onboarding/setup-guide";
import { BrandIcon } from "@/components/brand/brand-logo";
import { Hint } from "@/components/ui/hint";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  ACCOUNT_NAV_ITEMS,
  activeNavItemTo,
  BADGE_DESCRIPTIONS,
  isActivePath,
  navGroups,
  type NavItem,
} from "@/features/navigation/nav-items";
import type { SessionUser } from "@/features/auth/session.functions";
import { chooseOnPlainClick, navTabAction, navTabClassName, TabBadge } from "./nav-tab-parts";
import type { BadgeCounts } from "./nav-tab";
import { ProfileSwitch, shownMenu, type ShownMenu } from "./nav-list";
import { SolarIcon, type SolarIconName } from "./solar-icon";
import { SupportButton } from "./support-button";
import { TeamModeMenuEntry } from "./team-mode-entry";
import { TopNav } from "./top-nav";
import type { AppNavigationState } from "./use-app-navigation";

type Area = "business" | "administration";

const TEAM_ORDER = new Map(
  [
    "/admin/chamados",
    "/admin/chamados/metricas",
    "/admin/avaliacoes",
    "/admin/products",
    "/admin/fornecedores",
    "/admin/clientes",
    "/admin/envios",
    "/admin/problemas",
    "/admin/equipe",
    "/admin/auditoria",
    "/admin/configuracoes",
    "/desenvolvedor",
  ].map((path, index) => [path, index]),
);
const TEAM_GROUP: Record<string, string> = {
  "/admin/chamados": "Atendimento",
  "/admin/chamados/metricas": "Atendimento",
  "/admin/avaliacoes": "Atendimento",
  "/admin/products": "Operação",
  "/admin/fornecedores": "Operação",
  "/admin/clientes": "Operação",
  "/admin/envios": "Operação",
  "/admin/problemas": "Operação",
};

function groupTeamItems(items: readonly NavItem[]): NavItem[] {
  return items
    .map((item) => ({ ...item, group: TEAM_GROUP[item.to] ?? "Gestão" }))
    .toSorted(
      (first, second) =>
        (TEAM_ORDER.get(first.to) ?? TEAM_ORDER.size) -
        (TEAM_ORDER.get(second.to) ?? TEAM_ORDER.size),
    );
}

function businessItems(shown: ShownMenu): NavItem[] {
  const accountItems = ACCOUNT_NAV_ITEMS[shown.kind];
  const extra = accountItems.filter((item) => item.to !== "/suporte");
  // The tickets list stays one click away for everyone, last, under its own heading.
  const support = accountItems
    .filter((item) => item.to === "/suporte")
    .map((item) => ({ ...item, group: "Ajuda" }));
  if (shown.kind === "supplier") return [...shown.items, ...extra, ...support];
  const items = shown.items.flatMap((item) => {
    if (item.to === "/financeiro")
      return [item, ...extra.map((plan) => ({ ...plan, group: "Dinheiro" }))];
    if (item.to === "/dashboard" || item.group === "Vender") return [{ ...item, group: "Vendas" }];
    if (item.group === "Lojas") return [{ ...item, group: "Canais de venda" }];
    return [item];
  });
  return [...items, ...support];
}

const NAV_ICONS: Record<string, SolarIconName> = {
  "/dashboard": "home",
  "/fornecedores": "factory",
  "/catalogo": "box",
  "/publicacoes": "announcements",
  "/pedidos": "bag",
  "/perguntas": "support",
  "/financeiro": "wallet",
  "/assinatura": "card",
  "/lojas": "store",
  "/integracoes": "link",
  "/fornecedor/painel": "home",
  "/fornecedor/painel/pedidos": "bag",
  "/fornecedor/painel/vendas": "chart",
  "/suporte": "support",
  "/suporte/revendedores": "support",
  "/fornecedor/painel/recebimentos": "wallet",
  "/fornecedor/painel/extrato": "list",
  "/fornecedor/painel/produtos": "box",
  "/fornecedor/painel/importar": "list",
  "/fornecedor/painel/desempenho": "chart",
  "/fornecedor/painel/regras": "star",
  "/fornecedor/painel/marca": "store",
  "/admin/chamados": "ticket",
  "/admin/chamados/metricas": "chart",
  "/admin/avaliacoes": "star",
  "/admin/products": "box",
  "/admin/fornecedores": "factory",
  "/admin/clientes": "people",
  "/admin/envios": "truck",
  "/admin/problemas": "alert",
  "/admin/equipe": "people",
  "/admin/auditoria": "list",
  "/admin/configuracoes": "settings",
  "/desenvolvedor": "code",
};

function NavigationGroups({
  items,
  counts,
  activeTo,
  profileSlug = null,
  onNavigate,
  supportKind,
}: {
  items: readonly NavItem[];
  counts: BadgeCounts;
  activeTo: NavItem["to"] | null;
  profileSlug?: string | null;
  onNavigate?: (() => void) | undefined;
  /** Opens the help card (hours, new ticket, recent tickets) from "Suporte" instead of a link. */
  supportKind?: ProfileKind | undefined;
}) {
  return navGroups(items).map(({ heading, items: groupItems }) => (
    <div key={heading ?? groupItems[0]?.to} className="staff-nav-group">
      {heading ? <h3>{heading}</h3> : null}
      {groupItems.map((item) =>
        supportKind !== undefined && item.to === "/suporte" ? (
          <SupportButton
            key={item.to}
            unread={counts.supportReplies}
            profileKind={supportKind}
            className={`staff-nav-row ${navTabClassName({ isActive: activeTo === item.to, paintsOwnPill: true, padding: "px-3" })} text-body`}
            icon={<SolarIcon name="support" />}
          />
        ) : (
          <StaffNavLink
            key={item.to}
            item={item}
            count={item.badge ? counts[item.badge] : 0}
            active={activeTo === item.to}
            profileSlug={profileSlug}
            onNavigate={onNavigate}
          />
        ),
      )}
    </div>
  ));
}

function StaffNavLink({
  item,
  count,
  active,
  profileSlug,
  onNavigate,
}: {
  item: NavItem;
  count: number;
  active: boolean;
  profileSlug: string | null;
  onNavigate?: (() => void) | undefined;
}) {
  const badge = item.badge;
  const link = (
    <Link
      to={item.to}
      {...(profileSlug === null ? {} : { search: { perfil: profileSlug } })}
      activeOptions={{ exact: !active || item.exact === true, includeSearch: profileSlug !== null }}
      aria-current={active ? "page" : undefined}
      className={`staff-nav-row ${navTabClassName({ isActive: active, paintsOwnPill: true, padding: "px-3" })} text-body`}
      onClick={(event) => {
        if (onNavigate) chooseOnPlainClick(event, onNavigate);
      }}
    >
      <SolarIcon name={NAV_ICONS[item.to] ?? "list"} />
      <span className="min-w-0 flex-1">{item.label}</span>
      {badge && count > 0 ? (
        <TabBadge
          isError={badge === "failedListings"}
          count={count}
          description={BADGE_DESCRIPTIONS[badge](count)}
          className={badge === "openTickets" ? "staff-ticket-count" : undefined}
        />
      ) : null}
    </Link>
  );
  return (
    <Hint label={navTabAction(item.to)?.hint} openOnTap={false}>
      {link}
    </Hint>
  );
}

function NavigationSection({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle?: (() => void) | undefined;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-label`}>
      <div className="staff-nav-section-header">
        <h2 id={`${id}-label`}>{label}</h2>
        {onToggle ? (
          <button
            type="button"
            className="staff-nav-section-toggle"
            aria-labelledby={`${id}-label`}
            aria-expanded={open}
            aria-controls={id}
            onClick={onToggle}
          >
            <SolarIcon name="chevron" className="staff-nav-chevron size-4.5" />
          </button>
        ) : null}
      </div>
      <div id={id} className="staff-nav-section" data-open={open} inert={!open}>
        <div>{children}</div>
      </div>
    </section>
  );
}

export interface StaffSidebarProps {
  user: SessionUser;
  adminMode: boolean;
  profileKind: ProfileKind;
  state: AppNavigationState;
}

interface SidebarContentProps extends StaffSidebarProps {
  area: Area;
  setArea: (area: Area) => void;
  onNavigate?: (() => void) | undefined;
}

function BusinessMenu({
  state,
  profileKind,
  onNavigate,
}: Pick<SidebarContentProps, "state" | "profileKind" | "onNavigate">) {
  const { navigation, counts, pathname } = state;
  const [pickedProfile, setPickedProfile] = useState({ current: profileKind, shown: profileKind });
  const shownKind = pickedProfile.current === profileKind ? pickedProfile.shown : profileKind;
  const shown = shownMenu(navigation, shownKind, pathname);
  return (
    <>
      <ProfileSwitch
        sections={navigation.profileSections}
        shownKind={shownKind}
        onChange={(kind) => setPickedProfile({ current: profileKind, shown: kind })}
      />
      <NavigationGroups
        items={businessItems(shown)}
        activeTo={shown.activeTo}
        counts={counts}
        profileSlug={shown.slug}
        onNavigate={onNavigate}
        supportKind={shownKind}
      />
    </>
  );
}

function SidebarNavigation(props: SidebarContentProps) {
  // Only the team splits the menu into "Meu negócio" and "Administração"; a customer's menu is
  // just their own pages.
  if (isStaffRole(props.user.role)) return <TeamNavigation {...props} />;
  return (
    <nav aria-label="Principal" className="staff-nav">
      <BusinessMenu {...props} />
    </nav>
  );
}

function TeamNavigation(props: SidebarContentProps) {
  const { state, area, setArea, onNavigate, adminMode } = props;
  const { navigation, teamModeRole } = state;
  const teamItems = adminMode ? groupTeamItems(navigation.teamItems) : [];
  return (
    <nav aria-label="Principal" className="staff-nav">
      {onNavigate && teamModeRole !== null ? (
        <TeamModeMenuEntry role={teamModeRole} onEnter={onNavigate} />
      ) : null}
      {navigation.teamOnly ? null : (
        <NavigationSection
          label="Meu negócio"
          open={area === "business"}
          onToggle={
            teamItems.length > 0
              ? () => setArea(area === "business" ? "administration" : "business")
              : undefined
          }
        >
          <BusinessMenu {...props} />
        </NavigationSection>
      )}
      <StaffAdministrationSection
        items={teamItems}
        area={area}
        setArea={setArea}
        state={state}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

function StaffAdministrationSection({
  items,
  area,
  setArea,
  state,
  onNavigate,
}: Pick<SidebarContentProps, "area" | "setArea" | "state" | "onNavigate"> & {
  items: readonly NavItem[];
}) {
  if (items.length === 0) return null;
  return (
    <NavigationSection
      label="Administração"
      open={area === "administration"}
      onToggle={
        state.navigation.teamOnly
          ? undefined
          : () => setArea(area === "administration" ? "business" : "administration")
      }
    >
      <NavigationGroups
        items={items}
        activeTo={activeNavItemTo(items, state.pathname)}
        counts={state.counts}
        onNavigate={onNavigate}
      />
    </NavigationSection>
  );
}

function isTeamPath(pathname: string): boolean {
  return isActivePath(pathname, "/admin") || isActivePath(pathname, "/desenvolvedor");
}

function SidebarBrand({
  profileKind,
  onNavigate,
}: {
  profileKind: ProfileKind;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={profileKind === "supplier" ? "/fornecedor/painel" : "/dashboard"}
      aria-label={
        profileKind === "supplier" ? "SellBridge, painel do fornecedor" : "SellBridge, visão geral"
      }
      className="staff-sidebar-brand"
      onClick={(event) => {
        if (onNavigate) chooseOnPlainClick(event, onNavigate);
      }}
    >
      <BrandIcon />
      <span className="text-lg font-semibold">SellBridge</span>
    </Link>
  );
}

function MobileSidebar({
  open,
  setOpen,
  sidebar,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  sidebar: SidebarContentProps;
}) {
  const { profileKind } = sidebar;
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return undefined;
    const desktop = window.matchMedia("(min-width: 64rem)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [open, setOpen]);
  return (
    <div className="staff-mobile-controls">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger aria-label="Abrir menu" className="staff-mobile-button">
          <SolarIcon name="menu" />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="staff-sidebar staff-sidebar-mobile"
          showCloseButton={false}
          aria-describedby={undefined}
        >
          <header className="staff-sidebar-header">
            <SheetTitle className="sr-only">Navegação</SheetTitle>
            <SidebarBrand profileKind={profileKind} onNavigate={close} />
            <button
              type="button"
              aria-label="Fechar menu"
              className="staff-mobile-button"
              onClick={close}
            >
              <SolarIcon name="close" />
            </button>
          </header>
          <SidebarNavigation {...sidebar} onNavigate={close} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function StaffSidebarLayout({
  children,
  setupReminder,
  ...props
}: StaffSidebarProps & { children: ReactNode; setupReminder: ReactNode }) {
  const { user, adminMode, profileKind, state } = props;
  const pathname = state.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const canOpenAdmin = adminMode && state.navigation.teamItems.length > 0;
  const routeArea =
    canOpenAdmin && (state.navigation.teamOnly || isTeamPath(pathname))
      ? "administration"
      : "business";
  const [selection, setSelection] = useState<{ pathname: string; routeArea: Area; area: Area }>({
    pathname,
    routeArea,
    area: routeArea,
  });
  const routeChanged = selection.pathname !== pathname || selection.routeArea !== routeArea;
  if (routeChanged) setSelection({ pathname, routeArea, area: routeArea });
  if (selection.pathname !== pathname && mobileOpen) setMobileOpen(false);
  const sidebar = {
    ...props,
    area: canOpenAdmin && !routeChanged ? selection.area : routeArea,
    setArea: (area: Area) => setSelection({ pathname, routeArea, area }),
  };
  return (
    <div className="staff-workspace">
      <aside
        aria-label="Menu lateral"
        className="staff-sidebar staff-sidebar-desktop"
        data-print-hidden
      >
        <header className="staff-sidebar-header">
          <SidebarBrand profileKind={profileKind} />
        </header>
        <SidebarNavigation {...sidebar} />
      </aside>
      <div
        className="staff-main-panel min-w-0"
        data-scroll-restoration-id="staff-main-panel"
        data-support-workspace
      >
        <DashboardSetupProvider>
          <TopNav
            user={user}
            adminMode={adminMode}
            profileKind={profileKind}
            state={state}
            setupReminder={setupReminder}
            staffMobileMenu={
              <MobileSidebar open={mobileOpen} setOpen={setMobileOpen} sidebar={sidebar} />
            }
          />
          {children}
        </DashboardSetupProvider>
      </div>
    </div>
  );
}
