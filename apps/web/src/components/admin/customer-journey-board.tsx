import type { CustomerStage } from "@sellbridge/shared/customer-health";
import { Link } from "@tanstack/react-router";
import {
  MoonIcon,
  RocketLaunchIcon,
  WarningIcon,
  WrenchIcon,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { HealthRing } from "@/components/admin/health-ring";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import type { JourneyColumn, RankedCustomer } from "@/features/admin/customer-ranking";
import { healthHeadline } from "@/features/admin/issue-copy";
import { cn } from "@/lib/utils";

const STAGES: Record<
  CustomerStage,
  { label: string; hint: string; icon: PhosphorIcon; tint: string }
> = {
  setup: {
    label: "Configurando",
    hint: "Ainda nos primeiros passos",
    icon: WrenchIcon,
    tint: "bg-muted text-muted-foreground",
  },
  selling: {
    label: "Vendendo",
    hint: "Tudo funcionando",
    icon: RocketLaunchIcon,
    tint: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  at_risk: {
    label: "Em risco",
    hint: "Loja ou publicações paradas",
    icon: WarningIcon,
    tint: "bg-destructive/10 text-destructive",
  },
  cooling: {
    label: "Esfriando",
    hint: "Vendas em queda ou sem acesso",
    icon: MoonIcon,
    tint: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
};

function JourneyCard({ customer }: { customer: RankedCustomer }) {
  return (
    <li>
      <Link
        from="/admin/clientes/"
        to="."
        search={(previous) => ({
          ...previous,
          view: "list",
          query: customer.email,
          issue: undefined,
          open: customer.id,
          page: 1,
        })}
        className="surface-interactive block space-y-2 rounded-2xl bg-card p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex items-center gap-2">
          <HealthRing score={customer.health.score} size="sm" />
          <span className="min-w-0 truncate text-sm font-medium">{customer.name}</span>
        </span>
        <span className="block text-footnote text-muted-foreground">
          {healthHeadline(customer.health)}
        </span>
        {customer.stores.length > 0 ? (
          <span className="flex gap-1">
            {customer.stores.map((store) => (
              <MarketplaceMark
                key={`${store.marketplace}-${store.shopName}`}
                marketplace={store.marketplace}
                className="size-5 rounded-md"
              />
            ))}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * Customers laid out by where they are in their life on the platform, so the admin sees where
 * the base gets stuck. The weakest account in each column comes first.
 */
export function CustomerJourneyBoard({ columns }: { columns: readonly JourneyColumn[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {columns.map((column) => {
        const stage = STAGES[column.stage];
        const hidden = column.total - column.customers.length;
        return (
          <section
            key={column.stage}
            aria-label={stage.label}
            className="flex flex-col gap-3 rounded-3xl bg-foreground/[0.035] p-3"
          >
            <header className="flex items-center justify-between gap-2 px-1 pt-1">
              <span className="flex items-center gap-2">
                <span
                  className={cn("flex size-7 items-center justify-center rounded-lg", stage.tint)}
                >
                  <stage.icon weight="duotone" className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{stage.label}</span>
                  <span className="block text-caption text-muted-foreground">{stage.hint}</span>
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                {column.total}
              </span>
            </header>
            {column.customers.length === 0 ? (
              <p className="px-1 pb-2 text-footnote text-muted-foreground">Ninguém aqui agora.</p>
            ) : (
              <ul className="space-y-2">
                {column.customers.map((customer) => (
                  <JourneyCard key={customer.id} customer={customer} />
                ))}
              </ul>
            )}
            {hidden > 0 ? (
              <p className="px-1 text-footnote text-muted-foreground">
                e mais {hidden} {hidden === 1 ? "cliente" : "clientes"}
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
