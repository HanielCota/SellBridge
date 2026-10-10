import { formatCents } from "@sellbridge/shared/money";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, SignInIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { CustomerAccess } from "@/components/admin/customer-access";
import { CustomerProfileForm } from "@/components/admin/customer-profile-form";
import { CustomerRegionForm } from "@/components/admin/customer-region-form";
import { CustomerStores } from "@/components/admin/customer-stores";
import { ToneStatus } from "@/components/data/tone-status";
import { ErrorState } from "@/components/feedback/error-state";
import { roleLabel } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { adminGetCustomer } from "@/features/admin/customers.functions";
import { customerQueryOptions } from "@/features/admin/customers.queries";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

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
  const [isStarting, setIsStarting] = useState(false);
  async function impersonate() {
    setIsStarting(true);
    const result = await authClient.admin.impersonateUser({ userId });
    if (result.error) {
      setIsStarting(false);
      toast.error(result.error.message ?? "Não foi possível entrar como este cliente.");
      return;
    }
    window.location.assign("/dashboard");
  }
  return (
    <Button
      disabled={disabledReason !== null || isStarting}
      title={disabledReason ?? undefined}
      onClick={() => void impersonate()}
    >
      <SignInIcon aria-hidden="true" />
      {isStarting ? "Entrando..." : "Entrar como cliente"}
    </Button>
  );
}

function CustomerHeader({ detail, isSelf }: { detail: CustomerDetail; isSelf: boolean }) {
  const { customer } = detail;
  let disabledReason: string | null = null;
  if (isSelf) {
    disabledReason = "Esta é a sua conta";
  }
  if (customer.banned) {
    disabledReason = "Desbloqueie a conta para entrar como o cliente";
  }
  return (
    <header className="space-y-4">
      <Link
        to="/admin/clientes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
        Clientes
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {customer.email}
            <ToneStatus
              tone={customer.banned ? "danger" : "success"}
              label={customer.banned ? "Bloqueado" : "Ativo"}
            />
            <span>{roleLabel(customer.role)}</span>
          </p>
        </div>
        <ImpersonateButton userId={customer.id} disabledReason={disabledReason} />
      </div>
    </header>
  );
}

function ActivityStrip({ detail }: { detail: CustomerDetail }) {
  const { customer, summary } = detail;
  const items = [
    { label: "Receita (30 dias)", value: formatCents(summary?.revenueCents ?? 0) },
    { label: "Lucro (30 dias)", value: formatCents(summary?.profitCents ?? 0) },
    { label: "Pedidos (30 dias)", value: String(summary?.orders ?? 0) },
    { label: "Publicações ativas", value: String(customer.publishedListings) },
    { label: "Publicações com erro", value: String(customer.failedListings) },
    { label: "Chamados abertos", value: String(detail.openTickets) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="surface-card space-y-2 rounded-3xl bg-card p-4">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="text-2xl font-semibold tracking-tight tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
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
      <ActivityStrip detail={detail} />
      <div className="grid gap-4 xl:grid-cols-2">
        <CustomerProfileForm
          key={`${customer.name}-${customer.email}`}
          userId={customer.id}
          name={customer.name}
          email={customer.email}
        />
        <CustomerRegionForm
          key={detail.region?.cep ?? "none"}
          userId={customer.id}
          region={detail.region}
        />
        <CustomerAccess
          userId={customer.id}
          role={customer.role}
          banned={customer.banned}
          banReason={customer.banReason}
          isSelf={isSelf}
        />
        <CustomerStores userId={customer.id} stores={detail.stores} />
      </div>
    </div>
  );
}
