import { BILLING_PLANS, type BillingPlan, type BillingPlanId } from "@sellbridge/shared/billing";
import { formatCents } from "@sellbridge/shared/money";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { CheckIcon, HeadsetIcon, WarningIcon } from "@phosphor-icons/react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisabledHint } from "@/components/ui/hint";
import { billingNoticeCopy } from "@/features/billing/billing-notice";
import { billingQueryOptions } from "@/features/billing/billing.queries";
import { checkoutBilling, manageBilling } from "@/features/billing/billing.functions";
import {
  overLimitWarning,
  planAllowance,
  recommendedPlan,
  type BillingUsage,
} from "@/features/billing/plan-choice";
import { formatFeePercent } from "@/features/supplier-payments/fee-percent";
import { errorMessage } from "@/lib/errors";

type BillingData = ReturnType<typeof useBillingData>;

const OWNER_ONLY_REASON = "Só o dono da conta pode assinar ou mudar o plano";

function useBillingData() {
  return useSuspenseQuery(billingQueryOptions()).data;
}

function dateLabel(isoDate: string | Date): string {
  return new Date(isoDate).toLocaleDateString("pt-BR", { timeZone: REPORT_TIME_ZONE });
}

/** The access ends at a moment; the reseller keeps the whole day before it. */
function lastDayLabel(isoDate: string): string {
  return dateLabel(new Date(new Date(isoDate).getTime() - 1));
}

function useBillingAction() {
  return useMutation({
    mutationFn: async (target: BillingPlanId | "portal") => {
      const result =
        target === "portal"
          ? await manageBilling()
          : await checkoutBilling({ data: { plan: target } });
      window.location.assign(result.url);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function currentPlanOf(data: BillingData): BillingPlan | null {
  if (data.access.kind !== "plan") return null;
  const { planId } = data.access;
  return BILLING_PLANS.find((plan) => plan.id === planId) ?? null;
}

function SubscriptionBadge({ data }: { data: BillingData }) {
  const { account } = data;
  if (account === null || data.access.kind !== "plan") return null;
  if (account.status === "past_due") {
    return <Badge variant="destructive">Pagamento pendente</Badge>;
  }
  if (account.cancelAtPeriodEnd && account.periodEnd !== null) {
    return <Badge variant="secondary">Termina em {dateLabel(account.periodEnd)}</Badge>;
  }
  return <Badge>Ativo</Badge>;
}

function currentTitle(data: BillingData, plan: BillingPlan | null): string {
  if (plan !== null) return `Seu plano: ${plan.name}`;
  if (data.access.kind === "transition") {
    return `Tudo liberado até ${lastDayLabel(data.access.until)}`;
  }
  if (data.access.kind === "unlimited") return "Tudo liberado";
  return "Você ainda não tem plano";
}

function UsageLine({ usage, limits }: { usage: BillingUsage; limits: BillingUsage | null }) {
  const listings = new Intl.NumberFormat("pt-BR");
  if (limits === null) {
    return (
      <p className="text-muted-foreground">
        {usage.stores} {usage.stores === 1 ? "loja conectada" : "lojas conectadas"} ·{" "}
        {listings.format(usage.listings)} {usage.listings === 1 ? "anúncio" : "anúncios"}
      </p>
    );
  }
  return (
    <p className="text-muted-foreground">
      <span className="font-semibold text-foreground">{usage.stores}</span> de {limits.stores} lojas
      · <span className="font-semibold text-foreground">{listings.format(usage.listings)}</span> de{" "}
      {listings.format(limits.listings)} anúncios
    </p>
  );
}

function renewalLine(account: NonNullable<BillingData["account"]>): string | null {
  if (account.periodEnd === null || account.status === "past_due") return null;
  if (account.cancelAtPeriodEnd) return null;
  return `Próxima cobrança em ${dateLabel(account.periodEnd)}`;
}

function CurrentPlan({ data }: { data: BillingData }) {
  const action = useBillingAction();
  const plan = currentPlanOf(data);
  const renewal = plan !== null && data.account !== null ? renewalLine(data.account) : null;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">
            <h2>{currentTitle(data, plan)}</h2>
          </CardTitle>
          <SubscriptionBadge data={data} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <UsageLine usage={data.usage} limits={data.access.limits} />
        {renewal === null ? null : <p className="text-muted-foreground">{renewal}</p>}
        {data.notice === null ? null : <NoticeText notice={data.notice} />}
        {data.account?.customerId === null || data.account === null ? null : (
          <PortalButton
            disabled={!data.canManage || !data.enabled || action.isPending}
            pending={action.isPending && action.variables === "portal"}
            onClick={() => action.mutate("portal")}
            reason={data.canManage ? null : OWNER_ONLY_REASON}
          />
        )}
      </CardContent>
    </Card>
  );
}

function NoticeText({ notice }: { notice: NonNullable<BillingData["notice"]> }) {
  const copy = billingNoticeCopy(notice);
  const tone = copy.tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div role="alert" className={`flex gap-2 ${tone}`}>
      {copy.tone === "danger" ? (
        <WarningIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : null}
      <p>
        <span className="font-semibold">{copy.title}.</span> {copy.description}
      </p>
    </div>
  );
}

function PortalButton({
  disabled,
  pending,
  onClick,
  reason,
}: {
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
  reason: string | null;
}) {
  const button = (
    <Button variant="outline" disabled={disabled} onClick={onClick} className="w-full sm:w-auto">
      {pending ? "Abrindo..." : "Cartão, faturas e cancelamento"}
    </Button>
  );
  if (reason === null) return button;
  return <DisabledHint reason={reason}>{button}</DisabledHint>;
}

function PlanPrice({ priceCents }: { priceCents: number | undefined }) {
  if (priceCents === undefined) {
    return <p className="text-2xl font-semibold text-muted-foreground">Em breve</p>;
  }
  return (
    <p>
      <span className="text-3xl font-semibold tracking-tight">{formatCents(priceCents)}</span>
      <span className="text-muted-foreground">/mês</span>
    </p>
  );
}

function PlanFeatures({ plan }: { plan: BillingPlan }) {
  const allowance = planAllowance(plan);
  return (
    <ul className="space-y-2">
      {[allowance.stores, allowance.listings].map((item) => (
        <li key={item} className="flex gap-2">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-text" aria-hidden="true" />
          {item}
        </li>
      ))}
      {plan.prioritySupport ? (
        <li className="flex gap-2">
          <HeadsetIcon className="mt-0.5 size-4 shrink-0 text-brand-text" aria-hidden="true" />
          Atendimento prioritário: resposta em até 8 horas
        </li>
      ) : null}
    </ul>
  );
}

function planButtonLabel(plan: BillingPlan, hasPlan: boolean, pending: boolean): string {
  if (pending) return "Abrindo pagamento...";
  return hasPlan ? `Mudar para ${plan.name}` : `Assinar o ${plan.name}`;
}

function PlanCard({
  plan,
  data,
  recommended,
  action,
}: {
  plan: BillingPlan;
  data: BillingData;
  recommended: boolean;
  action: ReturnType<typeof useBillingAction>;
}) {
  const current = currentPlanOf(data);
  const isCurrent = current?.id === plan.id;
  const price = data.prices.find((candidate) => candidate.id === plan.id)?.priceCents;
  const warning = current === null || isCurrent ? null : overLimitWarning(plan, data.usage);
  return (
    <Card className={recommended ? "ring-2 ring-brand" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold tracking-tight">{plan.name}</h3>
          {isCurrent ? <Badge>Seu plano</Badge> : null}
          {recommended ? <Badge>Indicado para você</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <PlanPrice priceCents={data.enabled ? price : undefined} />
        <PlanFeatures plan={plan} />
        {warning === null ? null : <p className="text-sm text-muted-foreground">{warning}</p>}
        <div className="mt-auto">
          <PlanAction
            plan={plan}
            data={data}
            isCurrent={isCurrent}
            recommended={recommended}
            action={action}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PlanAction({
  plan,
  data,
  isCurrent,
  recommended,
  action,
}: {
  plan: BillingPlan;
  data: BillingData;
  isCurrent: boolean;
  recommended: boolean;
  action: ReturnType<typeof useBillingAction>;
}) {
  if (!data.enabled) {
    return <p className="text-sm text-muted-foreground">Disponível quando a cobrança começar</p>;
  }
  if (isCurrent) return null;
  const pending = action.isPending && action.variables === plan.id;
  const button = (
    <Button
      className="h-11 w-full"
      variant={recommended ? "default" : "outline"}
      disabled={!data.canManage || action.isPending}
      onClick={() => action.mutate(plan.id)}
    >
      {planButtonLabel(plan, currentPlanOf(data) !== null, pending)}
    </Button>
  );
  if (data.canManage) return button;
  return <DisabledHint reason={OWNER_ONLY_REASON}>{button}</DisabledHint>;
}

function PlanChoices({ data }: { data: BillingData }) {
  const action = useBillingAction();
  // Only an account still choosing gets a plan pointed out; one with a plan already chose.
  const recommended =
    data.enabled && currentPlanOf(data) === null ? recommendedPlan(data.usage).id : null;
  return (
    <section aria-labelledby="plan-choices-title" className="space-y-3">
      <h2 id="plan-choices-title" className="text-lg font-semibold">
        Planos
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {BILLING_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            data={data}
            recommended={recommended === plan.id}
            action={action}
          />
        ))}
      </div>
    </section>
  );
}

function PlanTerms({ feeBasisPoints }: { feeBasisPoints: number | null }) {
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p>
        Todos os planos têm catálogo de fornecedores, pedidos, financeiro, relatórios e suporte.
        {feeBasisPoints === null || feeBasisPoints === 0
          ? null
          : ` Além da mensalidade, a plataforma cobra ${formatFeePercent(feeBasisPoints)} de cada venda.`}
      </p>
      <p>
        A mensalidade é cobrada todo mês no cartão. Subir de plano vale na hora; descer vale na
        próxima mensalidade. Seus pedidos e anúncios nunca saem do ar por causa do plano.
      </p>
    </div>
  );
}

const RETURN_MESSAGES = {
  sucesso: "Pagamento enviado. Seu plano aparece aqui em alguns segundos.",
  troca: "Troca de plano enviada. O novo plano aparece aqui em alguns segundos.",
  cancelado: "Você saiu do pagamento. Nada mudou no seu plano.",
} as const;

export function BillingPage({ returned }: { returned?: keyof typeof RETURN_MESSAGES | undefined }) {
  const data = useBillingData();
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Planos e assinatura"
        description="Escolha quantas lojas e anúncios você precisa. Dá para mudar de plano quando quiser."
      />
      {returned === undefined ? null : (
        <output className="block rounded-xl bg-muted px-4 py-3">{RETURN_MESSAGES[returned]}</output>
      )}
      {data.enabled ? null : (
        <output className="block rounded-xl bg-muted px-4 py-3">
          Os planos ainda não começaram. Enquanto isso, tudo continua liberado.
        </output>
      )}
      <CurrentPlan data={data} />
      <PlanChoices data={data} />
      <PlanTerms feeBasisPoints={data.platformFeeBasisPoints} />
    </div>
  );
}
