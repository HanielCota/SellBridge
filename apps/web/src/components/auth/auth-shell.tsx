import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const COPYRIGHT_YEAR = new Date().getFullYear();

/** The login page has no title, so its logo can be the focal point; other pages keep it smaller. */
function AuthBrandLogo() {
  const isLoginPage = useRouterState({ select: (state) => state.location.pathname === "/login" });
  if (isLoginPage) {
    return <BrandLogo className="mb-12 text-[34px]" iconClassName="size-14" />;
  }
  return <BrandLogo className="mb-7 text-2xl" iconClassName="size-10" />;
}

/** The centered frame of the sign-in pages: logo, theme toggle and footer. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-surface-grouped">
      <header className="flex justify-end px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6">
        <ThemeToggle />
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center px-5 pb-20"
      >
        <div className="flex w-full max-w-[380px] animate-in flex-col items-center duration-500 ease-out fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
          <AuthBrandLogo />
          <div className="w-full">{children}</div>
        </div>
      </main>
      <footer className="px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
        © {COPYRIGHT_YEAR} SellBridge
      </footer>
    </div>
  );
}
