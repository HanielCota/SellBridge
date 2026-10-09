import {
  GearSixIcon,
  MapPinIcon,
  MoonIcon,
  QuestionIcon,
  SignOutIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTheme } from "@/components/theme/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/features/auth/session.functions";
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

/** Round settings button: account details and the settings that are rarely used. */
export function UserMenu({ user, supportReplies }: { user: SessionUser; supportReplies: number }) {
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
              <span className="ml-auto rounded-full bg-brand/15 px-2 text-xs font-medium text-brand">
                {supportReplies}
              </span>
            ) : null}
          </Link>
        </DropdownMenuItem>
        <ThemeMenuItem />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <SignOutIcon aria-hidden="true" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
