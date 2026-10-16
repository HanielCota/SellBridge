import type {
  BillingPlan,
  BillingPlanId,
  PaidPlanId,
  PlanFeature,
} from "@sellbridge/shared/billing";
import { formatCents } from "@sellbridge/shared/money";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { billingNoticeCopy } from "@/features/billing/billing-notice";
import { billingQueryOptions } from "@/features/billing/billing.queries";
import { checkoutBilling, manageBilling } from "@/features/billing/billing.functions";
import { errorMessage } from "@/lib/errors";

const STATUS_LABELS: Record<string, string> = {
  free: "Gratuito",
  active: "Ativa",
  trialing: "Período de teste",
  past_due: "Pagamento pendente",
  unpaid: "Pagamento não realizado",
  incomplete: "Pagamento incompleto",
  incomplete_expired: "Pagamento expirado",
  canceled: "Cancelada",
  paused: "Pausada",
};

function useBillingAction() {
  return useMutation({
    mutationFn: async (plan: PaidPlanId | "portal") => {
      const result =
        plan === "portal" ? await manageBilling() : await checkoutBilling({ data: { plan } });
      window.location.assign(result.url);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function periodEndLabel(account: { status: string; cancelAtPeriodEnd: boolean }): string {
  if (account.status === "canceled") {
    return "Encerrada em";
  }
  if (account.cancelAtPeriodEnd) {
    return "Cancelamento previsto para";
  }
  return "Fim do período atual";
}

function PlanPrice({
  planId,
  priceCents,
}: {
  planId: BillingPlanId;
  priceCents: number | undefined;
}) {
  if (planId === "free") {
    return "R$ 0";
  }
  if (priceCents === undefined) {
    return "Em breve";
  }
  return `${formatCents(priceCents)}/mês`;
}

/** "1 loja conectada" or "Até 5.000 anúncios". */
function limitLabel(limit: number, one: string, many: string): string {
  if (limit === 1) {
    return `1 ${one}`;
  }
  return `Até ${limit.toLocaleString("pt-BR")} ${many}`;
}

const FEATURE_LABELS: Record<PlanFeature, string> = {
  advanced_reports: "Relatórios avançados",
  fiscal: "Notas fiscais",
  ai_assistant: "Assistente com IA",
  priority_support: "Atendimento prioritário",
};

/** The plan's lines beyond stores and listings; today's plans release every feature. */
function PlanExtras({ plan }: { plan: BillingPlan }) {
  if (plan.users === null) {
    return <li>Catálogo, painel, finanças e suporte</li>;
  }
  return (
    <>
      <li>{limitLabel(plan.users, "usuário", "usuários")}</li>
      <li>Suporte responde em até {plan.supportResponseHours} h</li>
      {plan.features.map((feature) => (
        <li key={feature}>{FEATURE_LABELS[feature]}</li>
      ))}
    </>
  );
}

function PlanAction({
  planId,
  isCurrent,
  canSelect,
  onSelect,
}: {
  planId: BillingPlanId;
  isCurrent: boolean;
  canSelect: boolean;
  onSelect: (planId: Exclude<BillingPlanId, "free">) => void;
}) {
  if (planId === "free") {
    return (
      <p className="text-sm text-muted-foreground">
        {isCurrent ? "Plano atual" : "Disponível após o encerramento da assinatura"}
      </p>
    );
  }
  return (
    <Button className="w-full" disabled={!canSelect || isCurrent} onClick={() => onSelect(planId)}>
      {isCurrent ? "Plano atual" : "Selecionar plano"}
    </Button>
  );
}

function CurrentSubscription() {
  const { data } = useSuspenseQuery(billingQueryOptions());
  const action = useBillingAction();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Seu plano: {data.effectivePlan.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p>Situação: {STATUS_LABELS[data.account?.status ?? "free"] ?? "Em atualização"}</p>
        <p>
          {data.usage.stores} de {data.effectivePlan.stores} lojas · {data.usage.listings} de{" "}
          {data.effectivePlan.listings} anúncios
        </p>
        {data.account?.periodEnd ? (
          <p>
            {periodEndLabel(data.account)}:{" "}
            {new Date(data.account.periodEnd).toLocaleDateString("pt-BR", {
              timeZone: REPORT_TIME_ZONE,
            })}
          </p>
        ) : null}
        {data.notice === null ? null : (
          <p role="alert">{billingNoticeCopy(data.notice).description}</p>
        )}
        {data.account?.customerId ? (
          <Button
            disabled={!data.canManage || !data.enabled || action.isPending}
            onClick={() => action.mutate("portal")}
          >
            Gerenciar assinatura e faturas
          </Button>
        ) : null}
        <p className="text-sm text-muted-foreground">
          No portal você pode trocar de plano, atualizar o cartão, consultar faturas e cancelar a
          renovação.
        </p>
      </CardContent>
    </Card>
  );
}

function PlanChoices() {
  const { data } = useSuspenseQuery(billingQueryOptions());
  const action = useBillingAction();
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {data.plans.map((plan) => {
        const price = data.prices.find((candidate) => candidate.id === plan.id);
        return (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-2xl font-semibold">
                <PlanPrice planId={plan.id} priceCents={price?.priceCents} />
              </p>
              <ul className="space-y-2">
                <li>{limitLabel(plan.stores, "loja conectada", "lojas conectadas")}</li>
                <li>{limitLabel(plan.listings, "anúncio", "anúncios")}</li>
                <PlanExtras plan={plan} />
              </ul>
              <PlanAction
                planId={plan.id}
                isCurrent={data.effectivePlan.id === plan.id}
                canSelect={data.enabled && data.canManage && !action.isPending}
                onSelect={(planId) => action.mutate(planId)}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function BillingPage({ returned }: { returned?: string | undefined }) {
  const { data } = useSuspenseQuery(billingQueryOptions());
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold">Planos e assinatura</h1>
        <p className="mt-2 text-muted-foreground">
          Escolha o plano para suas lojas. Os planos pagos renovam automaticamente a cada mês.
        </p>
      </div>
      {returned === "sucesso" ? (
        <output className="block">
          Pagamento enviado. A confirmação e os limites serão atualizados automaticamente.
        </output>
      ) : null}
      {returned === "cancelado" ? (
        <output className="block">Você saiu do pagamento. Seu plano permanece o mesmo.</output>
      ) : null}
      {data.enabled ? null : (
        <output className="block">
          Os planos pagos estarão disponíveis quando a cobrança for ativada. Sua operação atual
          continua disponível.
        </output>
      )}
      {data.canManage ? null : (
        <p>Somente o proprietário da organização pode alterar a assinatura.</p>
      )}
      <CurrentSubscription />
      <PlanChoices />
      <p className="text-sm text-muted-foreground">
        Ao encerrar um plano, os dados são preservados. Novos anúncios e conexões ficam sujeitos aos
        limites do plano disponível.
      </p>
    </div>
  );
}
