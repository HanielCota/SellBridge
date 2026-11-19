import { WarningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisabledHint } from "@/components/ui/hint";
import { billingNoticeCopy } from "@/features/billing/billing-notice";
import {
  cancelBilling,
  changeBillingPaymentMethod,
  openBillingPayment,
} from "@/features/billing/billing.functions";
import type { BillingUsage } from "@/features/billing/plan-choice";
import { formatFeePercent } from "@/features/supplier-payments/fee-percent";
import {
  currentPlanOf,
  dateLabel,
  hasLiveSubscription,
  lastDayLabel,
  OWNER_ONLY_REASON,
  paymentToFix,
  planById,
  useBillingAction,
  useBillingData,
  type BillingData,
} from "./billing-data";
import { PaymentMethodDialog, type PaymentMethod } from "./billing-dialogs";
import { PlanChoices } from "./plan-cards";

type Subscription = NonNullable<BillingData["subscription"]>;

function SubscriptionBadge({ data }: { data: BillingData }) {
  const { subscription } = data;
  if (subscription === null || data.access.kind !== "plan") return null;
  if (subscription.status === "past_due") {
    return <Badge variant="destructive">Pagamento pendente</Badge>;
  }
  if (subscription.cancelAtPeriodEnd && subscription.periodEnd !== null) {
    return <Badge variant="secondary">Termina em {lastDayLabel(subscription.periodEnd)}</Badge>;
  }
  return <Badge>Ativo</Badge>;
}

function currentTitle(data: BillingData): string {
  const plan = currentPlanOf(data);
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

function methodLabel(method: string | null): string {
  return method === "credit_card" ? "no cartão" : "por Pix";
}

/** What happens next with the subscription, in one or two plain sentences. */
function subscriptionLines(subscription: Subscription, live: boolean): string[] {
  const lines: string[] = [];
  const waitingPlan = planById(subscription.plan);
  if (subscription.status === "incomplete" && waitingPlan !== null) {
    lines.push(`O pagamento do plano ${waitingPlan.name} está esperando você.`);
  }
  const upgrade = planById(subscription.upgradePlan);
  if (upgrade !== null) lines.push(`Mudança para o ${upgrade.name}: falta pagar a diferença.`);
  if (live && subscription.status === "active" && subscription.periodEnd !== null) {
    const method = methodLabel(subscription.paymentMethod);
    lines.push(`Próxima mensalidade em ${lastDayLabel(subscription.periodEnd)}, ${method}.`);
  }
  const scheduled = planById(subscription.scheduledPlan);
  if (scheduled !== null && subscription.scheduledPlanAt !== null) {
    lines.push(`O ${scheduled.name} começa em ${dateLabel(subscription.scheduledPlanAt)}.`);
  }
  return lines;
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

function needsPayment(data: BillingData): boolean {
  const { subscription } = data;
  if (subscription === null) return false;
  const waiting = subscription.status === "incomplete" && subscription.hasSubscription;
  return paymentToFix(data) || waiting || subscription.upgradePlan !== null;
}

function OwnerButton({ data, children }: { data: BillingData; children: React.ReactElement }) {
  if (data.canManage) return children;
  return <DisabledHint reason={OWNER_ONLY_REASON}>{children}</DisabledHint>;
}

function cancelDescription(periodEnd: string | null): string {
  const until = periodEnd === null ? "o fim do mês pago" : lastDayLabel(periodEnd);
  return `Seu plano vale até ${until} e não renova. Depois disso, pedidos e anúncios no ar continuam, mas você não conecta lojas novas nem publica anúncios novos.`;
}

function PayNowButton({ data }: { data: BillingData }) {
  const pay = useBillingAction(async () => openBillingPayment(), "Pagamento aberto.");
  return (
    <OwnerButton data={data}>
      <Button
        className="h-11 w-full sm:w-auto"
        disabled={!data.canManage || pay.isPending}
        onClick={() => pay.mutate(undefined)}
      >
        {pay.isPending ? "Abrindo..." : "Pagar agora"}
      </Button>
    </OwnerButton>
  );
}

function PaymentMethodChange({ data }: { data: BillingData }) {
  const [open, setOpen] = useState(false);
  const method = useBillingAction(
    async (chosen: PaymentMethod) => changeBillingPaymentMethod({ data: { method: chosen } }),
    "Forma de pagamento atualizada.",
  );
  const periodEnd = data.subscription?.periodEnd ?? null;
  const from =
    periodEnd === null
      ? "Vale a partir da próxima mensalidade."
      : `Vale a partir da próxima mensalidade, em ${lastDayLabel(periodEnd)}.`;
  return (
    <>
      <OwnerButton data={data}>
        <Button
          variant="outline"
          className="h-11 w-full sm:w-auto"
          disabled={!data.canManage}
          onClick={() => setOpen(true)}
        >
          Trocar forma de pagamento
        </Button>
      </OwnerButton>
      <PaymentMethodDialog
        open={open}
        onOpenChange={setOpen}
        title="Como você quer pagar daqui em diante?"
        description={from}
        pending={method.isPending}
        onChoose={(chosen) => method.mutate(chosen, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}

function SubscriptionCancel({ data }: { data: BillingData }) {
  const [open, setOpen] = useState(false);
  const cancel = useBillingAction(async () => {
    await cancelBilling();
    return { url: null };
  }, "Assinatura cancelada. Seu plano vale até o fim do mês pago.");
  return (
    <>
      <OwnerButton data={data}>
        <Button
          variant="ghost"
          className="h-11 w-full text-destructive sm:w-auto"
          disabled={!data.canManage}
          onClick={() => setOpen(true)}
        >
          Cancelar assinatura
        </Button>
      </OwnerButton>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancelar a assinatura"
        description={cancelDescription(data.subscription?.periodEnd ?? null)}
        confirmLabel="Cancelar assinatura"
        pendingLabel="Cancelando..."
        cancelLabel="Manter assinatura"
        destructive
        isPending={cancel.isPending}
        onConfirm={() => cancel.mutate(undefined, { onSuccess: () => setOpen(false) })}
      />
    </>
  );
}

function SubscriptionActions({ data }: { data: BillingData }) {
  const live = hasLiveSubscription(data);
  const showPay = needsPayment(data);
  if (!showPay && !live) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {showPay ? <PayNowButton data={data} /> : null}
      {live && !paymentToFix(data) ? <PaymentMethodChange data={data} /> : null}
      {live ? <SubscriptionCancel data={data} /> : null}
    </div>
  );
}

function CurrentPlan({ data }: { data: BillingData }) {
  // Without a plan the limits are zero: "0 de 0 lojas" says nothing, so show the usage alone.
  const limits = data.access.kind === "none" ? null : data.access.limits;
  const live = hasLiveSubscription(data);
  const lines = data.subscription === null ? [] : subscriptionLines(data.subscription, live);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">
            <h2>{currentTitle(data)}</h2>
          </CardTitle>
          <SubscriptionBadge data={data} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <UsageLine usage={data.usage} limits={limits} />
        {lines.map((line) => (
          <p key={line} className="text-muted-foreground">
            {line}
          </p>
        ))}
        {data.notice === null ? null : <NoticeText notice={data.notice} />}
        {data.enabled ? <SubscriptionActions data={data} /> : null}
      </CardContent>
    </Card>
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
        A mensalidade é cobrada todo mês, no cartão ou por Pix. Subir de plano vale na hora: você
        paga só a diferença até a próxima mensalidade. Descer vale na próxima mensalidade. Seus
        pedidos e anúncios nunca saem do ar por causa do plano.
      </p>
    </div>
  );
}

const RETURN_MESSAGES = {
  sucesso: "Pagamento enviado. Seu plano aparece aqui em alguns segundos.",
  troca: "Pagamento da diferença enviado. O novo plano aparece aqui em alguns segundos.",
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
