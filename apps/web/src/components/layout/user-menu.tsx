import {
  GearSixIcon,
  MapPinIcon,
  MoonIcon,
  QuestionIcon,
  ShieldCheckIcon,
  SignOutIcon,
  SunIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/features/auth/session.functions";
import { setAdminMode } from "@/features/auth/session.functions";
import { authClient } from "@/lib/auth-client";

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
  return async function signOut() {
    const result = await authClient.signOut();
    if (result.error) {
      toast.error("Não foi possível sair. Tente novamente.");
      return;
    }
    await navigate({ to: "/login" });
  };
}

function ThemeMenuItem() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <DropdownMenuItem onSelect={toggleTheme}>
      {isDark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
      {isDark ? "Usar tema claro" : "Usar tema escuro"}
    </DropdownMenuItem>
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
    >
      <ShieldCheckIcon aria-hidden="true" />
      Modo administrador
    </DropdownMenuCheckboxItem>
  );
}

interface UserMenuProps {
  user: SessionUser;
  supportReplies: number;
  adminMode: boolean;
}

/** Round settings button: account details and the settings that are rarely used. */
export function UserMenu({ user, supportReplies, adminMode }: UserMenuProps) {
  const signOut = useSignOut();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30"
      >
        <GearSixIcon className="size-5" aria-hidden="true" />
        {supportReplies > 0 ? (
          <span
            className="absolute top-2 right-2 size-2 rounded-full bg-brand"
            aria-hidden="true"
          />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/perfil">
            <UserCircleIcon aria-hidden="true" />
            Meu perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/onboarding">
            <MapPinIcon aria-hidden="true" />
            Minha região
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/suporte">
            <QuestionIcon aria-hidden="true" />
            Ajuda e suporte
            {supportReplies > 0 ? (
              <span className="ml-auto rounded-full bg-brand/15 px-2 text-xs font-medium text-brand-text">
                {supportReplies}
              </span>
            ) : null}
          </Link>
        </DropdownMenuItem>
        <ThemeMenuItem />
        {user.role === "admin" ? <AdminModeItem enabled={adminMode} /> : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <SignOutIcon aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
