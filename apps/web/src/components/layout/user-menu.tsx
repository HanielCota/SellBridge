import {
  CaretDownIcon,
  type Icon,
  MapPinIcon,
  MoonIcon,
  PlugsConnectedIcon,
  QuestionIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SunIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
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
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = { admin: "Administrador", user: "Revendedor" };

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts.at(0)?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? "") : "";
  const result = `${first}${last}`.toUpperCase();
  return result.length > 0 ? result : "?";
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

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
    await navigate({ to: "/login" });
  };
}

/** Rows read as plain choices: full-strength labels, quieter icons. */
const MENU_ROW =
  "gap-2.5 px-2.5 py-2 text-foreground [&_svg]:text-muted-foreground data-highlighted:[&_svg]:text-foreground";

const THEME_OPTIONS = [
  { value: "light", label: "Claro", icon: SunIcon },
  { value: "dark", label: "Escuro", icon: MoonIcon },
] as const satisfies readonly { value: Theme; label: string; icon: Icon }[];

/**
 * Theme as a two-way switch that shows the current choice, like the period control, instead of
 * an action whose label names the theme you are not using. A raised pill (white in light, a lifted
 * gray in dark, never a black block) fills the chosen half and glides across; the menu stays open
 * so the change is seen.
 */
function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center justify-between gap-3 py-1 pr-1 pl-2.5">
      <span id="theme-choice-label" className="text-sm text-muted-foreground">
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
            "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-card shadow-sm shadow-black/10 transition-transform dark:bg-white/15 dark:shadow-none duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]",
            theme === "dark" && "translate-x-full",
          )}
        />
        {THEME_OPTIONS.map((option) => (
          <DropdownMenuPrimitive.RadioItem
            key={option.value}
            value={option.value}
            onSelect={(event) => {
              event.preventDefault();
              const item = event.currentTarget;
              setTheme(option.value, item instanceof HTMLElement ? item : undefined);
            }}
            className="relative flex cursor-default items-center justify-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors duration-300 outline-none select-none data-[state=checked]:text-foreground data-[state=unchecked]:data-highlighted:text-foreground"
          >
            <option.icon className="size-3.5" aria-hidden="true" />
            {option.label}
          </DropdownMenuPrimitive.RadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </div>
  );
}

/** Shows or hides the admin tools in the interface; only offered to admin accounts. */
function AdminModeItem({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const navigate = useNavigate();
  const isOnAdminPage = useRouterState({
    select: (state) => state.location.pathname.startsWith("/admin"),
  });
  async function toggle(next: boolean) {
    try {
      await setAdminMode({ data: { enabled: next } });
    } catch {
      toast.error("Não foi possível alterar o modo administrador.");
      return;
    }
    toast.success(next ? "Modo administrador ativado" : "Modo administrador desativado");
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
      Modo administrador
      {/* Drawn like the Switch so on/off reads at a glance; the item itself carries the state. */}
      <span
        aria-hidden="true"
        className={cn(
          "ml-auto flex h-5 w-8 shrink-0 items-center rounded-full p-0.5 transition-colors",
          enabled ? "bg-brand" : "bg-input",
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

/** The pages about you; support shows how many answers are waiting. */
function AccountLinks({ supportReplies }: { supportReplies: number }) {
  return (
    <>
      <DropdownMenuItem asChild className={MENU_ROW}>
        <Link to="/perfil">
          <UserCircleIcon aria-hidden="true" />
          Meu perfil
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={MENU_ROW}>
        <Link to="/onboarding">
          <MapPinIcon aria-hidden="true" />
          Minha região
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={MENU_ROW}>
        <Link to="/integracoes">
          <PlugsConnectedIcon aria-hidden="true" />
          Integrações
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={MENU_ROW}>
        <Link to="/suporte">
          <QuestionIcon aria-hidden="true" />
          Ajuda e suporte
          {supportReplies > 0 ? (
            <span className="ml-auto rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand-text">
              {supportReplies === 1 ? "1 resposta" : `${supportReplies} respostas`}
            </span>
          ) : null}
        </Link>
      </DropdownMenuItem>
    </>
  );
}

interface UserMenuProps {
  user: SessionUser;
  supportReplies: number;
  adminMode: boolean;
}

/** Caret beside the account name: the account pages, the theme and signing out. */
export function UserMenu({ user, supportReplies, adminMode }: UserMenuProps) {
  const signOut = useSignOut();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        className="group relative flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-[color,scale] duration-150 outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 active:scale-[0.96] active:duration-100 data-[state=open]:text-foreground motion-reduce:active:scale-100"
      >
        <CaretDownIcon
          className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
          weight="bold"
          aria-hidden="true"
        />
        {supportReplies > 0 ? (
          <span
            className="absolute top-2 right-2 size-2 rounded-full bg-brand"
            aria-hidden="true"
          />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-72 rounded-2xl border-0 p-2 shadow-black/15 ring-1 ring-border"
      >
        <DropdownMenuLabel className="px-2.5 pt-1.5 pb-2 font-normal">
          <span className="block text-xs text-muted-foreground">Conectado como</span>
          <span className="block truncate text-sm font-medium text-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="-mx-2" />
        <AccountLinks supportReplies={supportReplies} />
        {user.role === "admin" ? <AdminModeItem enabled={adminMode} /> : null}
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
