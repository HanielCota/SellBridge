import { teamModeName } from "@/features/auth/team-mode";
import { unreadRepliesText } from "@/features/support/response-time";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { hasStaffPermission, isStaffRole } from "@sellbridge/shared/staff-access";
import {
  CaretDownIcon,
  ClockCounterClockwiseIcon,
  CreditCardIcon,
  type Icon,
  IdentificationCardIcon,
  MoonIcon,
  PlugsConnectedIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SunIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { type ReactNode, useRef } from "react";
import { toast } from "sonner";
import { type Theme, useTheme } from "@/components/theme/theme-provider";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/features/auth/session.functions";
import { setAdminMode } from "@/features/auth/session.functions";
import { authClient } from "@/lib/auth-client";
import { forgetTabProfile } from "@/lib/tab-profile";
import { cn } from "@/lib/utils";
import { accountPagesFor } from "./account-pages";
import { ACTION_ICONS } from "@/components/icons/action-icons";

function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async function signOut() {
    const result = await authClient.signOut();
    if (result.error) {
      toast.error("Não foi possível sair. Tente novamente.");
      return;
    }
    // Cached sessions and profile data belong to the user who just left.
    queryClient.clear();
    forgetTabProfile();
    await navigate({ to: "/login" });
  };
}

/** Rows read as plain choices: full-strength labels, quieter icons. */
const SupportIcon = ACTION_ICONS.support.icon;

const MENU_ROW =
  "gap-3 px-2.5 py-2.5 text-base text-foreground [&_svg:not([class*='size-'])]:size-5 [&_svg]:text-muted-foreground data-highlighted:[&_svg]:text-foreground";

const THEME_OPTIONS = [
  { value: "light", label: "Claro", icon: SunIcon },
  { value: "dark", label: "Escuro", icon: MoonIcon },
] as const satisfies readonly { value: Theme; label: string; icon: Icon }[];

/**
 * Theme as a two-way switch that shows the current choice, like the period control, instead of
 * an action whose label names the theme you are not using. A raised pill (white in light, a lifted
 * gray in dark, never a black block) fills the chosen half; the menu stays open so the change is
 * seen.
 */
function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center justify-between gap-3 py-1 pr-1 pl-2.5">
      <span id="theme-choice-label" className="text-base text-muted-foreground">
        Tema
      </span>
      <DropdownMenuRadioGroup
        aria-labelledby="theme-choice-label"
        value={theme}
        className="relative grid grid-cols-2 rounded-full bg-muted p-1"
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-card shadow-sm shadow-black/10 dark:bg-white/15 dark:shadow-none",
            theme === "dark" && "translate-x-full",
          )}
        />
        {THEME_OPTIONS.map((option) => (
          <DropdownMenuPrimitive.RadioItem
            key={option.value}
            value={option.value}
            onSelect={(event) => {
              event.preventDefault();
              setTheme(option.value);
            }}
            className="relative flex cursor-default items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground outline-none select-none data-[state=checked]:text-foreground data-[state=unchecked]:data-highlighted:text-foreground"
          >
            <option.icon className="size-4" aria-hidden="true" />
            {option.label}
          </DropdownMenuPrimitive.RadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </div>
  );
}

/** Shows or hides the team tools in the interface; only offered to team accounts. */
function AdminModeItem({ enabled, role }: { enabled: boolean; role: string }) {
  const name = teamModeName(role);
  const router = useRouter();
  const navigate = useNavigate();
  const isOnAdminPage = useRouterState({
    select: (state) => state.location.pathname.startsWith("/admin"),
  });
  async function toggle(next: boolean) {
    try {
      await setAdminMode({ data: { enabled: next } });
    } catch {
      toast.error(`Não foi possível alterar o ${name.toLowerCase()}.`);
      return;
    }
    toast.success(next ? `${name} ativado` : `${name} desativado`);
    if (!next && isOnAdminPage) {
      await navigate({ to: "/dashboard" });
    }
    await router.invalidate();
  }
  return (
    <DropdownMenuCheckboxItem
      checked={enabled}
      onCheckedChange={(checked) => void toggle(checked)}
      onSelect={(event) => event.preventDefault()}
      className={cn(MENU_ROW, "pr-2.5 *:data-[slot=dropdown-menu-checkbox-item-indicator]:hidden")}
    >
      <ShieldCheckIcon aria-hidden="true" />
      {name}
      {/* Drawn like the Switch so on/off reads at a glance; the item itself carries the state. */}
      <span
        aria-hidden="true"
        className={cn(
          "ml-auto flex h-5 w-8 shrink-0 items-center rounded-full p-0.5 transition-colors",
          enabled ? "bg-brand" : "bg-foreground/45 dark:bg-input",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
            enabled && "translate-x-3",
          )}
        />
      </span>
    </DropdownMenuCheckboxItem>
  );
}

function SupplierProductShortcut({ profileKind }: { profileKind: ProfileKind }) {
  if (profileKind !== "supplier") return null;
  return (
    <DropdownMenuItem asChild className={MENU_ROW}>
      <Link to="/fornecedor/painel/produtos" search={{ product: "novo" }}>
        <IdentificationCardIcon aria-hidden="true" />
        Cadastrar produto
      </Link>
    </DropdownMenuItem>
  );
}

/** The pages about you; support shows how many answers are waiting. */
function AccountLinks({
  supportReplies,
  profileKind,
}: {
  supportReplies: number;
  profileKind: ProfileKind;
}) {
  const pages = new Set(accountPagesFor(profileKind));
  return (
    <>
      <DropdownMenuItem asChild className={MENU_ROW}>
        <Link to="/perfil">
          <UserCircleIcon aria-hidden="true" />
          Meu perfil
        </Link>
      </DropdownMenuItem>
      <SupplierProductShortcut profileKind={profileKind} />
      {pages.has("sellerData") ? (
        <DropdownMenuItem asChild className={MENU_ROW}>
          <Link to="/onboarding">
            <IdentificationCardIcon aria-hidden="true" />
            Meu cadastro
          </Link>
        </DropdownMenuItem>
      ) : null}
      {pages.has("billing") ? (
        <DropdownMenuItem asChild className={MENU_ROW}>
          <Link to="/assinatura" search={{ retorno: undefined }}>
            <CreditCardIcon aria-hidden="true" />
            Planos e assinatura
          </Link>
        </DropdownMenuItem>
      ) : null}
      {pages.has("integrations") ? (
        <DropdownMenuItem asChild className={MENU_ROW}>
          <Link to="/integracoes">
            <PlugsConnectedIcon aria-hidden="true" />
            Integrações
          </Link>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem asChild className={MENU_ROW}>
        <Link to="/suporte">
          <SupportIcon aria-hidden="true" />
          Ajuda e suporte
          {supportReplies > 0 ? (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/15 px-1.5 text-sm font-medium text-brand-text tabular-nums">
              {supportReplies}
              <span className="sr-only">, {unreadRepliesText(supportReplies)}</span>
            </span>
          ) : null}
        </Link>
      </DropdownMenuItem>
    </>
  );
}

/**
 * The team's switch and, in admin mode, the page the header has no room for: the audit log
 * (admins). Review moderation is a team tab of its own. Nothing for a customer.
 */
function TeamItems({ role, adminMode }: { role: string; adminMode: boolean }) {
  return (
    <>
      {isStaffRole(role) ? <AdminModeItem enabled={adminMode} role={role} /> : null}
      {adminMode && hasStaffPermission(role, "audit.view") ? (
        // Item 28.b: the admin-mode header has no room for another tab, so it lives here.
        <DropdownMenuItem asChild className={MENU_ROW}>
          <Link to="/admin/auditoria">
            <ClockCounterClockwiseIcon aria-hidden="true" />
            Auditoria
          </Link>
        </DropdownMenuItem>
      ) : null}
    </>
  );
}

interface UserMenuProps {
  user: SessionUser;
  supportReplies: number;
  adminMode: boolean;
  /** A supplier's menu leaves out the reseller's pages (`accountPagesFor`). */
  profileKind: ProfileKind;
  /** What the chip shows before the caret (avatar, name); the whole chip opens the menu. */
  children: ReactNode;
  className?: string;
}

/** The caret at the end of the chip; it flips while the menu is open. */
function MenuCaret() {
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors duration-150 group-hover:text-foreground group-data-[state=open]:text-foreground">
      <CaretDownIcon
        className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
        weight="bold"
        aria-hidden="true"
      />
    </span>
  );
}

/** The account chip: a click anywhere on it opens the account pages, the theme and signing out. */
export function UserMenu({
  user,
  supportReplies,
  adminMode,
  profileKind,
  children,
  className,
}: UserMenuProps) {
  const signOut = useSignOut();
  // Opened with the mouse, closing should not hand focus back to the chip and light its ring;
  // from the keyboard it still does, so you know where you are.
  const openedWithPointer = useRef(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        onPointerDown={() => {
          openedWithPointer.current = true;
        }}
        onKeyDown={() => {
          openedWithPointer.current = false;
        }}
        className={cn(
          "group flex items-center gap-3 text-left select-none transition-[scale] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-[0.98] active:duration-100 motion-reduce:active:scale-100",
          className,
        )}
      >
        {children}
        <MenuCaret />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        onCloseAutoFocus={(event) => {
          if (openedWithPointer.current) {
            event.preventDefault();
          }
        }}
        className="w-80 rounded-2xl border-0 p-2 shadow-black/15 ring-1 ring-border"
      >
        <DropdownMenuLabel className="px-2.5 pt-1.5 pb-2 font-normal">
          <span className="block text-sm text-muted-foreground">Conectado como</span>
          <span className="block truncate text-base font-medium text-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="-mx-2" />
        <AccountLinks supportReplies={supportReplies} profileKind={profileKind} />
        <TeamItems role={user.role} adminMode={adminMode} />
        <DropdownMenuSeparator className="-mx-2" />
        <ThemeChoice />
        <DropdownMenuSeparator className="-mx-2" />
        <DropdownMenuItem onSelect={() => void signOut()} className={MENU_ROW}>
          <SignOutIcon aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
