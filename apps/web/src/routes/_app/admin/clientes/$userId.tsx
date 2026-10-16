import { ISSUE_SEVERITY } from "@sellbridge/shared/customer-health";
import { formatCents } from "@sellbridge/shared/money";
import { isStaffRole } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ChartLineUpIcon,
  CurrencyCircleDollarIcon,
  MegaphoneSimpleIcon,
  PackageIcon,
  SignInIcon,
} from "@phosphor-icons/react";
import type { ComponentType, ReactNode } from "react";
import { CustomerAccess } from "@/components/admin/customer-access";
import {
  CustomerIssueList,
  OnboardingProgress,
  SectionLabel,
  WeeklyOrders,
} from "@/components/admin/customer-health-parts";
import { CustomerProfileForm } from "@/components/admin/customer-profile-form";
import { CustomerHolderCard } from "@/components/admin/customer-holder-card";
import { CustomerStores } from "@/components/admin/customer-stores";
import { CustomerTimeline } from "@/components/admin/customer-timeline";
import { HealthRing } from "@/components/admin/health-ring";
import { ISSUE_ICONS, SEVERITY_TINT } from "@/components/admin/issue-style";
import { SmartDate } from "@/components/data/smart-date";
import { ToneStatus } from "@/components/data/tone-status";
import { ErrorState } from "@/components/feedback/error-state";
import { SectionCard } from "@/components/layout/section-card";
import { roleLabel } from "@/components/layout/user-menu";
import { TrendBadge } from "@/components/reports/figures";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { adminGetCustomer } from "@/features/admin/customers.functions";
import { customerQueryOptions } from "@/features/admin/customers.queries";
import { useImpersonate } from "@/features/admin/use-impersonate";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/clientes/$userId")({
  loader: ({ context, params }) =>
    prefetchOnServer(context.queryClient, customerQueryOptions(params.userId)),
  head: () => ({ meta: [{ title: "Cliente (admin) | SellBridge" }] }),
  component: CustomerPage,
});

type CustomerDetail = Awaited<ReturnType<typeof adminGetCustomer>>;

/** Opens the app as the customer; everything done there is done on their account. */
function ImpersonateButton({
  userId,
  disabledReason,
}: {
  userId: string;
  disabledReason: string | null;
}) {
  const { impersonate, pendingUserId } = useImpersonate();
  return (
    <Button
      disabled={disabledReason !== null || pendingUserId !== null}
      title={disabledReason ?? undefined}
      onClick={() => void impersonate(userId)}
    >
      <SignInIcon weight="bold" aria-hidden="true" />
      {pendingUserId ? "Entrando…" : "Entrar como cliente"}
    </Button>
  );
}

/** Why "Entrar como cliente" is off, or null when it is available. */
function impersonationBlocker(detail: CustomerDetail, isSelf: boolean) {
  const { customer, access } = detail;
  if (customer.banned) {
    return "Desbloqueie a conta para entrar como o cliente";
  }
  if (isSelf) {
    return "Esta é a sua conta";
  }
  if (isStaffRole(customer.role)) {
    return "Contas da equipe não podem ser acessadas como cliente";
  }
  if (!access.canManage) {
    return "Só um dono da plataforma entra nesta conta";
  }
  return null;
}

function CustomerHeader({ detail, isSelf }: { detail: CustomerDetail; isSelf: boolean }) {
  const { customer, health, access } = detail;
  const disabledReason = impersonationBlocker(detail, isSelf);
  return (
    <header className="space-y-4">
      <Link
        to="/admin/clientes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Clientes
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <HealthRing score={health.score} size="lg" />
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{customer.name}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="truncate">{customer.email}</span>
              {customer.emailVerified ? null : (
                <ToneStatus tone="warning" label="E-mail não confirmado" />
              )}
              <ToneStatus
                tone={customer.banned ? "danger" : "success"}
                label={customer.banned ? "Bloqueado" : "Ativo"}
              />
              <span>{roleLabel(customer.role)}</span>
              {access.isPlatformOwner ? <span>Dono da plataforma</span> : null}
              <span>
                {customer.lastSeenAt ? (
                  <>
                    Último acesso <SmartDate date={customer.lastSeenAt} />
                  </>
                ) : (
                  "Nenhum acesso registrado"
                )}
              </span>
            </p>
          </div>
        </div>
        <ImpersonateButton userId={customer.id} disabledReason={disabledReason} />
      </div>
    </header>
  );
}

interface ActivityTile {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  /** Problems light up in their severity; everything else stays quiet. */
  tint: keyof typeof SEVERITY_TINT;
  note?: ReactNode;
}

function activityTiles(detail: CustomerDetail): ActivityTile[] {
  const { customer, summary } = detail;
  return [
    {
      label: "Receita (30 dias)",
      value: formatCents(customer.recentRevenueCents),
      icon: CurrencyCircleDollarIcon,
      tint: "muted",
    },
    {
      label: "Lucro (30 dias)",
      value: formatCents(summary?.profitCents ?? 0),
      icon: ChartLineUpIcon,
      tint: "muted",
    },
    {
      label: "Pedidos (30 dias)",
      value: String(customer.recentOrders),
      icon: PackageIcon,
      tint: "muted",
      note: (
        <TrendBadge
          current={customer.recentOrders}
          previous={customer.previousOrders}
          suffix="vs. mês anterior"
        />
      ),
    },
    {
      label: "Publicações ativas",
      value: String(customer.publishedListings),
      icon: MegaphoneSimpleIcon,
      tint: "muted",
    },
    {
      label: "Publicações com erro",
      value: String(customer.failedListings),
      icon: ISSUE_ICONS.listings,
      tint: customer.failedListings > 0 ? ISSUE_SEVERITY.listings : "muted",
    },
    {
      label: "Chamados abertos",
      value: String(detail.openTickets),
      icon: ISSUE_ICONS.ticket,
      tint: detail.openTickets > 0 ? ISSUE_SEVERITY.ticket : "muted",
    },
  ];
}

/** The account's last 30 days, in the same tiles the customers list opens with. */
function ActivityTiles({ detail }: { detail: CustomerDetail }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {activityTiles(detail).map((tile) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.label}
            data-glyph-trigger
            className="surface-card flex flex-col gap-3 rounded-3xl bg-card p-4"
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-8 items-center justify-center rounded-lg",
                SEVERITY_TINT[tile.tint],
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="flex flex-col-reverse gap-0.5">
              <dt className="text-footnote leading-tight text-muted-foreground">{tile.label}</dt>
              <dd className="truncate text-2xl font-semibold tracking-tight tabular-nums">
                {tile.value}
              </dd>
            </div>
            {tile.note ? <div className="-mt-1.5 text-xs">{tile.note}</div> : null}
          </div>
        );
      })}
    </dl>
  );
}

function AttentionCard({ detail }: { detail: CustomerDetail }) {
  const { customer, health } = detail;
  return (
    <SectionCard
      title="Precisa de você"
      description="O que destrava este cliente agora. Cada item tem o botão que resolve."
    >
      <div className="space-y-6">
        <CustomerIssueList customer={customer} issues={health.issues} />
        <div>
          <SectionLabel>Primeiros passos</SectionLabel>
          <OnboardingProgress completed={health.completedSteps} />
        </div>
      </div>
    </SectionCard>
  );
}

function AccountSection({ detail, isSelf }: { detail: CustomerDetail; isSelf: boolean }) {
  const { customer } = detail;
  return (
    <section aria-labelledby="customer-account" className="space-y-4 pt-2">
      <div className="space-y-1">
        <h2 id="customer-account" className="text-lg font-semibold tracking-tight">
          Conta
        </h2>
        <p className="text-sm text-muted-foreground">
          Dados de cadastro, cobrança e segurança do acesso.
        </p>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <CustomerProfileForm
            key={`${customer.name}-${customer.email}`}
            userId={customer.id}
            name={customer.name}
            email={customer.email}
            locked={!detail.access.canManage}
          />
          <CustomerHolderCard
            hasHolder={detail.profile.hasHolder}
            starterSupplier={detail.profile.starterSupplier}
          />
        </div>
        <CustomerAccess
          userId={customer.id}
          role={customer.role}
          banned={customer.banned}
          banReason={customer.banReason}
          isSelf={isSelf}
          canManage={detail.access.canManage}
          canGrantTeamRoles={detail.access.canGrantTeamRoles}
        />
      </div>
    </section>
  );
}

function CustomerPage() {
  const { userId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const query = useQuery(customerQueryOptions(userId));
  if (query.isPending) {
    return <Skeleton className="h-96 rounded-3xl" aria-label="Carregando cliente" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const detail = query.data;
  const { customer } = detail;
  const isSelf = customer.id === session.user.id;
  return (
    <div className="space-y-6">
      <CustomerHeader detail={detail} isSelf={isSelf} />
      <ActivityTiles detail={detail} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <AttentionCard detail={detail} />
          <SectionCard
            title="Pedidos por semana"
            description={`Ritmo de vendas nas últimas ${detail.weeklyOrders.length} semanas.`}
          >
            <WeeklyOrders weeks={detail.weeklyOrders} className="h-24" />
          </SectionCard>
        </div>
        <div className="space-y-4">
          <CustomerStores userId={customer.id} stores={detail.stores} />
          <SectionCard
            title="Linha do tempo"
            description="O que a equipe fez nesta conta e quando o cliente entrou por último."
          >
            <CustomerTimeline customer={customer} events={detail.events} />
          </SectionCard>
        </div>
      </div>
      <AccountSection detail={detail} isSelf={isSelf} />
    </div>
  );
}
