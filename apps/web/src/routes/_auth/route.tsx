import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ArrowLeftRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getAppSession } from "@/features/auth/session.functions";

const COPYRIGHT_YEAR = new Date().getFullYear();

export const Route = createFileRoute("/_auth")({
  beforeLoad: async () => {
    const session = await getAppSession();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between bg-zinc-950 p-10 text-zinc-50 lg:flex">
        <BrandMark />
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">
            Venda produtos de fornecedores da sua região sem manter estoque.
          </h2>
          <p className="text-zinc-400">
            Conecte suas lojas na Shopee, Mercado Livre e TikTok Shop, publique em poucos cliques e
            acompanhe vendas, lucro e financeiro em um só lugar.
          </p>
        </div>
        <p className="text-xs text-zinc-500">© {COPYRIGHT_YEAR} SellBridge</p>
      </aside>
      <main className="flex flex-col">
        <div className="flex items-center justify-between p-4 lg:justify-end">
          <span className="lg:hidden">
            <BrandMark />
          </span>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

function BrandMark() {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ArrowLeftRight className="size-4" aria-hidden="true" />
      </span>
      SellBridge
    </span>
  );
}
