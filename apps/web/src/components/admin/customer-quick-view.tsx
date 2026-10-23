import { formatCents } from "@sellbridge/shared/money";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, SignInIcon } from "@phosphor-icons/react";
import {
  CustomerIssueList,
  OnboardingProgress,
  SectionLabel,
  WeeklyOrders,
} from "@/components/admin/customer-health-parts";
import { CustomerContactDetails } from "@/components/admin/customer-contact-details";
import { CustomerTimeline } from "@/components/admin/customer-timeline";
import { HealthRing } from "@/components/admin/health-ring";
import { SmartDate } from "@/components/data/smart-date";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { RankedCustomer } from "@/features/admin/customer-ranking";
import { customerQueryOptions } from "@/features/admin/customers.queries";
import { useImpersonate } from "@/features/admin/use-impersonate";
import { cn } from "@/lib/utils";

function orderTrend(recent: number, previous: number): { label: string; className: string } {
  if (previous === 0) {
    return { label: recent > 0 ? "Novo" : "—", className: "text-muted-foreground" };
  }
  const change = Math.round(((recent - previous) / previous) * 100);
  if (change > 0) {
    return { label: `+${change}%`, className: "text-emerald-600 dark:text-emerald-400" };
  }
  if (change < 0) {
    return { label: `${change}%`, className: "text-destructive" };
  }
  return { label: "0%", className: "text-muted-foreground" };
}

function ActivityFigures({ customer }: { customer: RankedCustomer }) {
  const detail = useQuery(customerQueryOptions(customer.id));
  const trend = orderTrend(customer.recentOrders, customer.previousOrders);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-footnote text-muted-foreground">Receita (30 dias)</dt>
          <dd className="text-lg font-semibold tracking-tight tabular-nums">
            {formatCents(customer.recentRevenueCents)}
          </dd>
        </div>
        <div className="rounded-2xl bg-muted p-3">
          <dt className="text-footnote text-muted-foreground">Pedidos vs. mês anterior</dt>
          <dd className="text-lg font-semibold tracking-tight tabular-nums">
            {customer.recentOrders}{" "}
            <span className={cn("text-footnote font-medium", trend.className)}>{trend.label}</span>
          </dd>
        </div>
      </dl>
      <div>
        <SectionLabel>Pedidos por semana</SectionLabel>
        {detail.data ? (
          <WeeklyOrders weeks={detail.data.weeklyOrders} />
        ) : (
          <Skeleton className="h-14 rounded-xl" aria-label="Carregando pedidos" />
        )}
      </div>
      <div>
        <SectionLabel>Linha do tempo</SectionLabel>
        {detail.data ? (
          <CustomerTimeline customer={customer} events={detail.data.events} />
        ) : (
          <Skeleton className="h-24 rounded-xl" aria-label="Carregando linha do tempo" />
        )}
      </div>
    </div>
  );
}

/** Billing address behind the eye and the phone, which only admins receive. */
function ContactSection({ customerId }: { customerId: string }) {
  const detail = useQuery(customerQueryOptions(customerId));
  return (
    <div>
      <SectionLabel>Cobrança e contato</SectionLabel>
      {detail.data ? (
        <CustomerContactDetails contact={detail.data.contact} />
      ) : (
        <Skeleton className="h-24 rounded-xl" aria-label="Carregando contato" />
      )}
    </div>
  );
}

function QuickViewHeader({ customer, isSelf }: { customer: RankedCustomer; isSelf: boolean }) {
  const { impersonate, pendingUserId } = useImpersonate();
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <HealthRing score={customer.health.score} size="lg" />
        <div>
          <p className="text-subhead font-semibold">{customer.name}</p>
          <p className="text-footnote text-muted-foreground">
            {customer.lastSeenAt ? (
              <>
                Último acesso <SmartDate date={customer.lastSeenAt} />
              </>
            ) : (
              "Nenhum acesso registrado"
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/clientes/$userId" params={{ userId: customer.id }}>
            Ficha completa
            <ArrowUpRightIcon />
          </Link>
        </Button>
        <Button
          size="sm"
          disabled={isSelf || customer.banned || pendingUserId !== null}
          onClick={() => void impersonate(customer.id)}
        >
          <SignInIcon weight="bold" />
          {pendingUserId === customer.id ? "Entrando…" : "Entrar como cliente"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Opens under a customer's row: what needs doing for them, each with the button that does it,
 * how far they got in the first steps and how their sales are moving. The full record is one
 * link away for edits.
 */
export function CustomerQuickView({
  customer,
  isSelf,
}: {
  customer: RankedCustomer;
  isSelf: boolean;
}) {
  const { health } = customer;
  return (
    <section
      aria-label={`Resumo de ${customer.name}`}
      className="animate-in fade-in-0 slide-in-from-top-1 space-y-5 rounded-3xl bg-foreground/[0.035] p-5 ring-1 ring-foreground/[0.08] duration-300 ease-out motion-reduce:animate-none"
    >
      <QuickViewHeader customer={customer} isSelf={isSelf} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div>
            <SectionLabel>Precisa de você</SectionLabel>
            <CustomerIssueList customer={customer} issues={health.issues} />
          </div>
          <div>
            <SectionLabel>Primeiros passos</SectionLabel>
            <OnboardingProgress completed={health.completedSteps} />
          </div>
          <ContactSection customerId={customer.id} />
        </div>
        <ActivityFigures customer={customer} />
      </div>
    </section>
  );
}
